#!/usr/bin/env python3
"""Contract tests for .github/workflows/android-release.yml

Verifies triggers, permissions, exact publication guard conditions,
security preservation guards, and executes the extracted version derivation
shell script across exact ref agreements, unknown prefixes, mismatches,
empty inputs, and malformed tags.

The derivation has two inputs on a tag: the tag itself, and the internal build
production serves. The tag names the version and sets the floor of the code; the
release carries the higher of the two, because a build production already serves
must never be republished under a lower number. Every case below that omits
PRODUCTION_BUILD_NUMBER is the historical behaviour, unchanged on purpose.
"""

import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "android-release.yml"

ALLOWED_PUBLISH_CONDITIONS = {
    "startsWith(github.ref, 'refs/tags/')",
}


def load_workflow_text() -> str:
    if not WORKFLOW_PATH.is_file():
        raise FileNotFoundError(f"Workflow file not found at {WORKFLOW_PATH}")
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def get_publish_job_if_condition(workflow_content: str) -> str:
    """Extracts the 'if:' condition of the 'publish' job.
    Uses PyYAML if available; falls back to an indent-aware parser without external dependencies.
    """
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(workflow_content)
        if isinstance(data, dict):
            jobs = data.get("jobs", {})
            publish_job = jobs.get("publish", {})
            cond = publish_job.get("if")
            if cond is not None:
                return str(cond).strip()
    except Exception:
        pass

    # Indent-aware fallback parser
    lines = workflow_content.splitlines()
    in_jobs = False
    in_publish = False
    publish_indent = None
    for line in lines:
        stripped = line.strip()
        indent = len(line) - len(line.lstrip())
        if stripped == "jobs:":
            in_jobs = True
            continue
        if in_jobs:
            if in_publish:
                if stripped and indent <= publish_indent:
                    break
                if stripped.startswith("if:"):
                    raw_cond = stripped[len("if:") :].strip()
                    if (raw_cond.startswith('"') and raw_cond.endswith('"')) or (
                        raw_cond.startswith("'") and raw_cond.endswith("'")
                    ):
                        return raw_cond[1:-1].strip()
                    return raw_cond
            elif stripped == "publish:" or stripped.startswith("publish:"):
                in_publish = True
                publish_indent = indent

    raise ValueError("Could not find publish job 'if:' condition in workflow")


def validate_publish_job_condition(condition: str) -> None:
    if condition not in ALLOWED_PUBLISH_CONDITIONS:
        raise AssertionError(
            f"Unsafe or unauthorized publish condition: '{condition}'. "
            f"Must be strictly one of: {sorted(ALLOWED_PUBLISH_CONDITIONS)}"
        )


def extract_step_script(workflow_content: str, step_name: str) -> str:
    """Extracts the `run: |` body of the step whose name starts with `step_name`."""
    lines = workflow_content.splitlines()
    in_step = False
    in_run = False
    run_lines: list[str] = []
    run_indent: int | None = None
    script_indent: int | None = None

    for line in lines:
        if not in_step and "- name: " + step_name in line:
            in_step = True
            continue
        if in_step:
            if in_run:
                if line.strip():
                    current_indent = len(line) - len(line.lstrip())
                    if current_indent <= run_indent:
                        break
                    if script_indent is None:
                        script_indent = current_indent
                    run_lines.append(line[script_indent:])
                else:
                    run_lines.append("")
            elif line.strip().startswith("run: |"):
                in_run = True
                run_indent = len(line) - len(line.lstrip())

    if not run_lines:
        raise ValueError(f"Could not extract the {step_name!r} step script from the workflow")
    return "\n".join(run_lines).strip()


def extract_version_derivation_script(workflow_content: str) -> str:
    return extract_step_script(workflow_content, "Derive the version")


def run_step_script(script: str, cwd: Path, env_vars: dict[str, str]) -> tuple[int, str, str]:
    """Runs an extracted step in `cwd`, with a throwaway GITHUB_ENV the caller can read back."""
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(cwd),
        "GITHUB_ENV": str(cwd / "github-env"),
    }
    env.update(env_vars)
    proc = subprocess.run(["bash", "-c", script], cwd=cwd, env=env, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def run_derivation_script(
    script: str, env_vars: dict[str, str]
) -> tuple[int, dict[str, str], str, str]:
    with tempfile.NamedTemporaryFile(mode="w+", delete=False) as env_file:
        env_file_path = env_file.name

    try:
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "GITHUB_ENV": env_file_path,
        }
        env.update(env_vars)

        proc = subprocess.run(
            ["bash", "-c", script],
            env=env,
            capture_output=True,
            text=True,
        )

        output_env: dict[str, str] = {}
        with open(env_file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line:
                    k, v = line.split("=", 1)
                    output_env[k] = v

        return proc.returncode, output_env, proc.stdout, proc.stderr
    finally:
        if os.path.exists(env_file_path):
            os.remove(env_file_path)


class TestWorkflowTriggersAndPermissions(unittest.TestCase):
    def setUp(self) -> None:
        self.content = load_workflow_text()

    def test_triggers_include_tag_route_and_exact_repair_branch_only(self) -> None:
        on_match = re.search(r"on:\s*\n\s*push:\s*\n((?:\s+.*\n)+)", self.content)
        self.assertIsNotNone(on_match, "Expected 'on: push:' block in workflow")
        push_block = on_match.group(1)

        # Tags route must be unchanged ('v*')
        self.assertIn("tags:", push_block)
        tags_match = re.search(r"tags:\s*\n\s*-\s*'v\*'", push_block)
        self.assertIsNotNone(tags_match, "Expected tags: - 'v*' under push")

        # Branches route must be exact branch feature/android-v0.3.0-ux-repair only
        self.assertIn("branches:", push_block)
        branches_match = re.search(
            r"branches:\s*\n\s*-\s*'feature/android-v0\.3\.0-ux-repair'", push_block
        )
        self.assertIsNotNone(
            branches_match,
            "Expected branches: - 'feature/android-v0.3.0-ux-repair' under push",
        )

        # No other branch patterns allowed
        branch_lines = [
            line.strip()
            for line in re.findall(r"branches:\s*\n((?:\s*-\s*.*\n?)+)", push_block)[
                0
            ].splitlines()
            if line.strip().startswith("-")
        ]
        self.assertEqual(
            branch_lines,
            ["- 'feature/android-v0.3.0-ux-repair'"],
            f"Unexpected branch triggers: {branch_lines}",
        )

    def test_least_privilege_permissions(self) -> None:
        # Root permissions must be contents: read
        root_perm = re.search(
            r"^permissions:\s*\n\s*contents:\s*read", self.content, re.MULTILINE
        )
        self.assertIsNotNone(
            root_perm, "Root workflow permissions must be 'contents: read'"
        )

        # Build job must not escalate contents permission to write
        build_job_match = re.search(
            r"\n  build:\s*\n(.*?)(?=\n  \w+:|$)", self.content, re.DOTALL
        )
        self.assertIsNotNone(build_job_match, "build job must exist")
        self.assertNotIn(
            "contents: write",
            build_job_match.group(1),
            "build job must not have write permissions",
        )

        # Publish job must have contents: write
        publish_job_match = re.search(
            r"\n  publish:\s*\n(.*?)(?=\n  \w+:|$)", self.content, re.DOTALL
        )
        self.assertIsNotNone(publish_job_match, "publish job must exist")
        self.assertIn(
            "contents: write",
            publish_job_match.group(1),
            "publish job must have contents: write",
        )

    def test_publish_job_exact_tag_only_condition(self) -> None:
        cond = get_publish_job_if_condition(self.content)
        validate_publish_job_condition(cond)

    def test_unsafe_publish_guard_mutations_are_rejected(self) -> None:
        unsafe_mutations = [
            "startsWith(github.ref, 'refs/tags/') || true",
            "startsWith(github.ref, 'refs/tags/') || github.ref_type == 'branch'",
            "true",
            "always()",
            "startsWith(github.ref, 'refs/heads/')",
            "${{ startsWith(github.ref, 'refs/tags/') || true }}",
            "startsWith(github.ref, 'refs/tags/') || false || true",
        ]
        for unsafe in unsafe_mutations:
            with self.subTest(mutation=unsafe):
                mutated = re.sub(
                    r"(\n\s*publish:\s*\n.*?\n\s*if:).*",
                    rf"\1 {unsafe}",
                    self.content,
                    flags=re.DOTALL,
                )
                cond = get_publish_job_if_condition(mutated)
                with self.assertRaises(
                    AssertionError,
                    msg=f"Validator should have rejected unsafe condition: {unsafe}",
                ):
                    validate_publish_job_condition(cond)

        # Missing condition must also raise error
        no_if_content = re.sub(
            r"(\n\s*publish:\s*\n.*?)(\n\s*if:.*)",
            r"\1",
            self.content,
        )
        with self.assertRaises((ValueError, AssertionError)):
            cond = get_publish_job_if_condition(no_if_content)
            validate_publish_job_condition(cond)

    def test_security_guards_and_cleanup_preserved(self) -> None:
        # Key cert check preserved
        self.assertIn("EXPECTED_CERT_SHA256:", self.content)
        self.assertIn(
            "EE:0E:40:4B:21:10:52:B3:11:AE:0E:07:30:60:6E:9C:7D:55:54:31:54:63:D0:2F:9E:F3:3C:95:73:C4:31:F6",
            self.content,
        )
        self.assertIn("apksigner", self.content)

        # Signed requirement preserved
        self.assertIn("-PrequireSigned=true", self.content)

        # Keystore removal always executed
        self.assertIn("Remove the decoded keystore", self.content)
        step_match = re.search(
            r"- name: Remove the decoded keystore.*?(?=\n\s*(?:- name:|publish:|\Z))",
            self.content,
            re.DOTALL,
        )
        self.assertIsNotNone(step_match, "Keystore cleanup step must be present")
        step_body = step_match.group(0)
        self.assertIn(
            "if: always()", step_body, "Keystore cleanup must specify 'if: always()'"
        )
        self.assertIn(
            'rm -f "$RUNNER_TEMP/trindade-release.jks"',
            step_body,
            "Keystore cleanup must rm keystore file",
        )

        # Upload artifact preserved
        self.assertIn("uses: actions/upload-artifact@v6", self.content)
        self.assertIn("name: android-release", self.content)


class TestVersionDerivationExecution(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        workflow_content = load_workflow_text()
        cls.script = extract_version_derivation_script(workflow_content)

    def test_valid_repair_branch_derives_0_3_0_and_301(self) -> None:
        code, env_out, stdout, stderr = run_derivation_script(
            self.script,
            {
                "GITHUB_REF": "refs/heads/feature/android-v0.3.0-ux-repair",
                "GITHUB_REF_NAME": "feature/android-v0.3.0-ux-repair",
                "GITHUB_REF_TYPE": "branch",
            },
        )
        self.assertEqual(code, 0, f"Script failed with stderr: {stderr}")
        self.assertEqual(env_out.get("VERSION_NAME"), "0.3.0")
        self.assertEqual(env_out.get("VERSION_CODE"), "301")
        self.assertEqual(env_out.get("APK_NAME"), "trindade-0.3.0.apk")

    def test_valid_tag_derivation_formula(self) -> None:
        # The wide encoding the workflow documents: major * 1000000 + minor * 1000 + patch. The last case is
        # the widest tag the digit budget allows, so the boundary is fixed here rather than assumed.
        cases = [
            ("v0.3.0", "0.3.0", "3000", "trindade-0.3.0.apk"),
            ("v1.2.3", "1.2.3", "1002003", "trindade-1.2.3.apk"),
            ("v0.0.1", "0.0.1", "1", "trindade-0.0.1.apk"),
            ("v2.0.0", "2.0.0", "2000000", "trindade-2.0.0.apk"),
            ("v0.99.99", "0.99.99", "99099", "trindade-0.99.99.apk"),
            ("v1.999.999", "1.999.999", "1999999", "trindade-1.999.999.apk"),
        ]
        for tag, expected_name, expected_code, expected_apk in cases:
            with self.subTest(tag=tag):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": f"refs/tags/{tag}",
                        "GITHUB_REF_NAME": tag,
                        "GITHUB_REF_TYPE": "tag",
                    },
                )
                self.assertEqual(code, 0, f"Tag {tag} failed: {stderr}")
                self.assertEqual(env_out.get("VERSION_NAME"), expected_name)
                self.assertEqual(env_out.get("VERSION_CODE"), expected_code)
                self.assertEqual(env_out.get("APK_NAME"), expected_apk)

    def test_empty_or_missing_ref_env_fails_closed(self) -> None:
        cases = [
            {},
            {"GITHUB_REF": "", "GITHUB_REF_NAME": "v0.3.0", "GITHUB_REF_TYPE": "tag"},
            {
                "GITHUB_REF": "refs/tags/v0.3.0",
                "GITHUB_REF_NAME": "",
                "GITHUB_REF_TYPE": "tag",
            },
            {
                "GITHUB_REF": "refs/tags/v0.3.0",
                "GITHUB_REF_NAME": "v0.3.0",
                "GITHUB_REF_TYPE": "",
            },
            {"GITHUB_REF_NAME": "feature/android-v0.3.0-ux-repair"},
            {"GITHUB_REF_NAME": "v0.3.0"},
            {"GITHUB_REF": "refs/heads/feature/android-v0.3.0-ux-repair"},
        ]
        for env_case in cases:
            with self.subTest(case=env_case):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    env_case,
                )
                self.assertNotEqual(
                    code,
                    0,
                    f"Empty/missing ref env {env_case} should fail closed, got success",
                )
                self.assertNotIn("VERSION_NAME", env_out)
                self.assertNotIn("VERSION_CODE", env_out)

    def test_unknown_ref_prefixes_fail_closed(self) -> None:
        unknown_prefixes = [
            ("refs/pull/123/merge", "123/merge", "pull_request"),
            ("refs/pull/123/head", "123/head", "branch"),
            ("refs/notes/commits", "commits", "tag"),
            ("refs/remotes/origin/main", "origin/main", "branch"),
            ("refs/changes/01/1", "01/1", "branch"),
            ("custom/ref/test", "test", "branch"),
            ("refs/tags/sub/v0.3.0", "sub/v0.3.0", "tag"),
            ("heads/feature/android-v0.3.0-ux-repair", "feature/android-v0.3.0-ux-repair", "branch"),
        ]
        for ref, ref_name, ref_type in unknown_prefixes:
            with self.subTest(ref=ref):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": ref,
                        "GITHUB_REF_NAME": ref_name,
                        "GITHUB_REF_TYPE": ref_type,
                    },
                )
                self.assertNotEqual(
                    code, 0, f"Unknown ref prefix '{ref}' should fail closed"
                )
                self.assertNotIn("VERSION_NAME", env_out)
                self.assertNotIn("VERSION_CODE", env_out)

    def test_mismatched_refs_fail_closed(self) -> None:
        mismatch_cases = [
            # Repair branch ref with tag type
            (
                "refs/heads/feature/android-v0.3.0-ux-repair",
                "feature/android-v0.3.0-ux-repair",
                "tag",
            ),
            # Tag ref with branch type
            ("refs/tags/v0.3.0", "v0.3.0", "branch"),
            # Repair branch name with refs/tags/ prefix
            (
                "refs/tags/feature/android-v0.3.0-ux-repair",
                "feature/android-v0.3.0-ux-repair",
                "branch",
            ),
            # Tag name with refs/heads/ prefix
            ("refs/heads/v0.3.0", "v0.3.0", "tag"),
            # GITHUB_REF and GITHUB_REF_NAME mismatch for branch
            (
                "refs/heads/other-branch",
                "feature/android-v0.3.0-ux-repair",
                "branch",
            ),
            # GITHUB_REF and GITHUB_REF_NAME mismatch for tag
            ("refs/tags/v0.3.1", "v0.3.0", "tag"),
        ]
        for ref, ref_name, ref_type in mismatch_cases:
            with self.subTest(ref=ref, ref_name=ref_name, ref_type=ref_type):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": ref,
                        "GITHUB_REF_NAME": ref_name,
                        "GITHUB_REF_TYPE": ref_type,
                    },
                )
                self.assertNotEqual(
                    code, 0, f"Mismatched ref combo should fail closed: {ref}, {ref_name}, {ref_type}"
                )
                self.assertNotIn("VERSION_NAME", env_out)
                self.assertNotIn("VERSION_CODE", env_out)

    def test_rejected_branches(self) -> None:
        rejected_branches = [
            "main",
            "master",
            "feature/android-v0.3.0",
            "feature/android-v0.3.0-ux-repair-extra",
            "repair",
            "hotfix/0.3.0",
        ]
        for branch in rejected_branches:
            with self.subTest(branch=branch):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": f"refs/heads/{branch}",
                        "GITHUB_REF_NAME": branch,
                        "GITHUB_REF_TYPE": "branch",
                    },
                )
                self.assertNotEqual(
                    code, 0, f"Branch '{branch}' should have been rejected"
                )
                self.assertNotIn("VERSION_NAME", env_out)
                self.assertNotIn("VERSION_CODE", env_out)

    def test_production_build_above_the_tag_code_wins(self) -> None:
        # v0.7.1 derives 7001, and production already served 7012. Publishing 7001 would be the downgrade
        # this rule exists to prevent, so the release has to carry production's build.
        code, env_out, stdout, stderr = run_derivation_script(
            self.script,
            {
                "GITHUB_REF": "refs/tags/v0.7.1",
                "GITHUB_REF_NAME": "v0.7.1",
                "GITHUB_REF_TYPE": "tag",
                "PRODUCTION_BUILD_NUMBER": "7012",
            },
        )
        self.assertEqual(code, 0, f"Script failed with stderr: {stderr}")
        self.assertEqual(env_out.get("VERSION_NAME"), "0.7.1")
        self.assertEqual(env_out.get("VERSION_CODE"), "7012")
        self.assertEqual(env_out.get("APK_NAME"), "trindade-0.7.1.apk")
        self.assertIn("7012", stdout)

    def test_tag_code_wins_when_the_production_build_is_not_above_it(self) -> None:
        # A fresh version outranks whatever the last release of the previous one carried, and an equal
        # number is not an override but agreement. Both leave the tag as the deciding input.
        cases = [
            ("v0.7.1", "7001", "7001"),  # equal
            ("v1.0.0", "7012", "1000000"),  # production below the next major
            ("v0.8.0", "7000", "8000"),  # next minor already outranks the old build
        ]
        for tag, production_build, expected_code in cases:
            with self.subTest(tag=tag, production_build=production_build):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": f"refs/tags/{tag}",
                        "GITHUB_REF_NAME": tag,
                        "GITHUB_REF_TYPE": "tag",
                        "PRODUCTION_BUILD_NUMBER": production_build,
                    },
                )
                self.assertEqual(code, 0, f"Tag {tag} failed: {stderr}")
                self.assertEqual(env_out.get("VERSION_CODE"), expected_code)

    def test_a_production_build_that_is_not_a_number_fails_closed(self) -> None:
        # The value decides what Android installs, so a malformed one is refused instead of ignored: a
        # release that quietly fell back to the tag would be the downgrade the rule prevents.
        for value in ["0", "-5", "12a", "7012.0", "00712", " 7012"]:
            with self.subTest(value=value):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": "refs/tags/v0.7.1",
                        "GITHUB_REF_NAME": "v0.7.1",
                        "GITHUB_REF_TYPE": "tag",
                        "PRODUCTION_BUILD_NUMBER": value,
                    },
                )
                self.assertNotEqual(code, 0, f"'{value}' should have been rejected")
                self.assertNotIn("VERSION_CODE", env_out)
                self.assertIn("PRODUCTION_BUILD_NUMBER", stderr)

    def test_the_repair_branch_ignores_the_production_build(self) -> None:
        # The repair branch builds an artifact under a fixed pair, publishes nothing, and keeps behaving
        # exactly as before this rule existed.
        code, env_out, stdout, stderr = run_derivation_script(
            self.script,
            {
                "GITHUB_REF": "refs/heads/feature/android-v0.3.0-ux-repair",
                "GITHUB_REF_NAME": "feature/android-v0.3.0-ux-repair",
                "GITHUB_REF_TYPE": "branch",
                "PRODUCTION_BUILD_NUMBER": "7012",
            },
        )
        self.assertEqual(code, 0, f"Script failed with stderr: {stderr}")
        self.assertEqual(env_out.get("VERSION_NAME"), "0.3.0")
        self.assertEqual(env_out.get("VERSION_CODE"), "301")

    def test_an_empty_production_build_keeps_the_tag_formula(self) -> None:
        code, env_out, stdout, stderr = run_derivation_script(
            self.script,
            {
                "GITHUB_REF": "refs/tags/v0.7.1",
                "GITHUB_REF_NAME": "v0.7.1",
                "GITHUB_REF_TYPE": "tag",
                "PRODUCTION_BUILD_NUMBER": "",
            },
        )
        self.assertEqual(code, 0, f"Script failed with stderr: {stderr}")
        self.assertEqual(env_out.get("VERSION_CODE"), "7001")

    def test_rejected_tags(self) -> None:
        rejected_tags = [
            "v1.2",  # missing patch
            "v1.2.3.4",  # 4 components
            "0.3.0",  # missing leading v
            "v1.1000.0",  # minor > 999, which the encoding cannot hold without colliding with v2.0.0
            "v1.0.1000",  # patch > 999, same collision
            "vabc",  # non-numeric
            "",  # empty
        ]
        for tag in rejected_tags:
            with self.subTest(tag=tag):
                code, env_out, stdout, stderr = run_derivation_script(
                    self.script,
                    {
                        "GITHUB_REF": f"refs/tags/{tag}",
                        "GITHUB_REF_NAME": tag,
                        "GITHUB_REF_TYPE": "tag",
                    },
                )
                self.assertNotEqual(code, 0, f"Tag '{tag}' should have been rejected")
                self.assertNotIn("VERSION_NAME", env_out)
                self.assertNotIn("VERSION_CODE", env_out)


class TestProductionBuildSource(unittest.TestCase):
    """The build the release adopts is read from the API's own constant, not from a copy.

    The step exists because two numbers that describe the same binary drift apart the moment one of them is
    a second source. This test reads the workflow and the file the step greps, so a rename on either side
    fails here instead of on a tag.
    """

    def test_the_workflow_reads_the_api_constant(self) -> None:
        content = load_workflow_text()
        self.assertIn("LOCAL_APK_BUILD_NUMBER", content)
        self.assertIn("packages/backend/src/modules/app/app.service.ts", content)
        self.assertIn('"$GITHUB_ENV"', content)

    def test_the_constant_is_a_positive_decimal(self) -> None:
        declaration = (
            REPO_ROOT / "packages" / "backend" / "src" / "modules" / "app" / "app.service.ts"
        )
        match = re.search(
            r"^export const LOCAL_APK_BUILD_NUMBER = ([0-9]+);$",
            declaration.read_text(encoding="utf-8"),
            re.MULTILINE,
        )
        self.assertIsNotNone(
            match,
            "app.service.ts must declare LOCAL_APK_BUILD_NUMBER in the form the workflow greps",
        )
        self.assertGreater(int(match.group(1)), 0)


class TestProductionBinaryPreference(unittest.TestCase):
    """The release publishes the binary production serves, not a fresh rebuild of it.

    An APK is signed with timestamps, so rebuilding the same commit produces different bytes: a re-run of
    the publish job used to clobber the asset with a file whose sha256 nobody had announced. The tag carries
    the binary and its sidecar; the built APK is only the fallback for a tag that carries neither.
    """

    STEP = "Prefer the production binary committed with the tag"
    CERT = "EE:0E:40:4B:21:10:52:B3:11:AE:0E:07:30:60:6E:9C:7D:55:54:31:54:63:D0:2F:9E:F3:3C:95:73:C4:31:F6"

    def setUp(self) -> None:
        self.content = load_workflow_text()
        self.script = extract_step_script(self.content, self.STEP)
        # The fingerprint comes from the workflow, not from this file: the step reads it at run time, and a
        # copy here would keep these tests green while the release job died on an unbound variable.
        import yaml  # type: ignore

        self.declared_cert = (yaml.safe_load(self.content).get("env") or {}).get("EXPECTED_CERT_SHA256")
        self.assertEqual(self.CERT, self.declared_cert, "the workflow must declare the release fingerprint once")

    def _workspace(self, *, version_code: str = "7013", cert: str | None = None) -> tempfile.TemporaryDirectory:
        tmp = tempfile.TemporaryDirectory()
        root = Path(tmp.name)
        tools = root / "build-tools"
        tools.mkdir()
        cert = cert or self.CERT.replace(":", "")
        (tools / "aapt2").write_text(
            "#!/usr/bin/env bash\n"
            "printf \"package: name='com.trindade.app' versionCode='%s' versionName='%s'\\n\" "
            "\"$FAKE_VERSION_CODE\" \"$FAKE_VERSION_NAME\"\n",
            encoding="utf-8",
        )
        (tools / "apksigner").write_text(
            "#!/usr/bin/env bash\nprintf 'certificate SHA-256 digest: %s\\n' \"$FAKE_CERT\"\n",
            encoding="utf-8",
        )
        for tool in ("aapt2", "apksigner"):
            (tools / tool).chmod(0o755)

        committed_dir = root / "packages" / "backend" / "apk"
        committed_dir.mkdir(parents=True)
        committed = committed_dir / "trindade-0.7.2.apk"
        committed.write_bytes(b"PRODUCTION-BINARY")
        digest = subprocess.run(
            ["sha256sum", committed.name],
            cwd=committed_dir,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        (committed_dir / "trindade-0.7.2.apk.sha256").write_text(digest, encoding="utf-8")

        built = root / "packages" / "android" / "app" / "build" / "outputs" / "apk" / "release"
        built.mkdir(parents=True)
        (built / "app-release.apk").write_bytes(b"REBUILT-BINARY")

        self.env = {
            "VERSION_NAME": "0.7.2",
            "VERSION_CODE": version_code,
            "APK_NAME": "trindade-0.7.2.apk",
            "BUILD_TOOLS": str(tools),
            "EXPECTED_CERT_SHA256": self.declared_cert,
            "FAKE_VERSION_CODE": version_code,
            "FAKE_VERSION_NAME": "0.7.2",
            "FAKE_CERT": cert,
        }
        return tmp

    def test_the_committed_production_binary_becomes_the_asset(self) -> None:
        with self._workspace() as tmp:
            root = Path(tmp)
            code, out, err = run_step_script(self.script, root, self.env)

            self.assertEqual(0, code, err)
            staged = root / "release-assets" / "trindade-0.7.2.apk"
            self.assertEqual(b"PRODUCTION-BINARY", staged.read_bytes(), out)
            self.assertIn("sha256", out.lower())

    def test_a_sidecar_that_does_not_match_fails_closed(self) -> None:
        with self._workspace() as tmp:
            root = Path(tmp)
            (root / "packages" / "backend" / "apk" / "trindade-0.7.2.apk.sha256").write_text(
                "0" * 64 + "  trindade-0.7.2.apk\n", encoding="utf-8"
            )

            code, _out, err = run_step_script(self.script, root, self.env)

            self.assertNotEqual(0, code)
            self.assertRegex(err.upper(), r"FAILED|DID NOT MATCH")
            self.assertFalse((root / "release-assets" / "trindade-0.7.2.apk").exists())

    def test_a_production_binary_with_another_version_fails_closed(self) -> None:
        with self._workspace(version_code="7012") as tmp:
            root = Path(tmp)
            self.env["VERSION_CODE"] = "7013"

            code, _out, err = run_step_script(self.script, root, self.env)

            self.assertNotEqual(0, code)
            self.assertIn("7013", err)
            self.assertFalse((root / "release-assets" / "trindade-0.7.2.apk").exists())

    def test_a_missing_production_binary_leaves_the_built_apk_as_the_asset(self) -> None:
        with self._workspace() as tmp:
            root = Path(tmp)
            for path in (root / "packages" / "backend" / "apk").iterdir():
                path.unlink()

            code, out, err = run_step_script(self.script, root, self.env)

            self.assertEqual(0, code, err)
            self.assertIn("no production binary", out.lower())
            self.assertFalse((root / "release-assets" / "trindade-0.7.2.apk").exists())

    def test_the_staging_step_publishes_the_preferred_binary(self) -> None:
        staging = extract_step_script(self.content, "Stage the release asset")

        self.assertIn("PRODUCTION_ASSET_SHA256", staging)
        self.assertIn("release-assets", staging)


class TestEveryStepVariableIsDeclared(unittest.TestCase):
    """A step that reads a variable nobody declared fails in the release, not in review.

    This is what happened to the step that prefers the production binary: it compared the signer digest
    against `EXPECTED_CERT_SHA256`, declared `env:` on a sibling step only, and `set -u` aborted the
    publish after the tag existed. The unit tests around that step injected the variable themselves, so
    they stayed green while the workflow could not run. A step's `run:` block may only read what the
    workflow, its job, or the step itself declares -- or what the step assigns before reading.
    """

    SCRIPT = "android-release.yml"

    #: Variables the runner provides, plus the shell's own. None of them is ours to declare.
    BUILTIN = {
        "HOME", "PATH", "PWD", "OLDPWD", "SHELL", "IFS", "LANG", "LC_ALL", "TMPDIR", "USER", "LOGNAME",
        "HOSTNAME", "SHLVL", "BASH", "BASH_SOURCE", "BASH_VERSION", "RANDOM", "SECONDS", "GITHUB_ENV",
        "GITHUB_OUTPUT", "GITHUB_PATH", "GITHUB_STEP_SUMMARY", "GITHUB_ACTIONS", "RUNNER_OS",
        "BASH_REMATCH",
    }

    def _workflow(self) -> dict:
        import yaml  # type: ignore

        return yaml.safe_load(load_workflow_text())

    def test_no_step_reads_an_undeclared_variable(self) -> None:
        workflow = self._workflow()
        workflow_env = set(workflow.get("env") or {})
        failures: list[str] = []

        for job_id, job in (workflow.get("jobs") or {}).items():
            job_env = workflow_env | set(job.get("env") or {})
            # What earlier steps of this job handed to the next one, through $GITHUB_ENV.
            exported: set[str] = set()
            for step in job.get("steps") or []:
                script = step.get("run")
                if not script:
                    continue
                declared = job_env | set(step.get("env") or {}) | exported
                # `NAME=value`, `export NAME=value` and the `printf 'NAME=%s\n' >> "$GITHUB_ENV"` idiom.
                assigned = set(re.findall(r"(?m)^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)=", script))
                assigned |= set(re.findall(r"printf\s+'([A-Z][A-Z0-9_]+)=", script))
                # A read with a default (`${NAME:-x}`, `${NAME-d}`) cannot abort under `set -u`, so it needs
                # no declaration; a bare read does, and that is the one that stops a release halfway.
                reads_with_default = set(re.findall(r"\$\{([A-Z][A-Z0-9_]+):?-", script))
                used = set(re.findall(r"\$\{?([A-Z][A-Z0-9_]{2,})\}?", script))
                missing = {
                    name
                    for name in used - declared - assigned - reads_with_default - self.BUILTIN
                    if not name.startswith(("GITHUB_", "RUNNER_", "INPUT_"))
                }
                if missing:
                    failures.append(f"{job_id} / {step.get('name')}: {sorted(missing)}")
                exported |= assigned

        self.assertEqual([], failures, "steps read variables no env declares: " + "; ".join(failures))

    def test_the_production_binary_step_runs_with_the_workflow_environment(self) -> None:
        """The step is executed with what the YAML declares, not with a convenient hand-made env."""
        workflow = self._workflow()
        job = workflow["jobs"]["build"]
        declared = set(workflow.get("env") or {}) | set(job.get("env") or {})
        steps = job["steps"]
        index = next(i for i, s in enumerate(steps) if s.get("name") == TestProductionBinaryPreference.STEP)
        step = steps[index]
        declared |= set(step.get("env") or {})
        # The variables the earlier steps wrote to $GITHUB_ENV are the workflow's environment too.
        for earlier in steps[:index]:
            declared |= set(re.findall(r"printf\s+'([A-Z][A-Z0-9_]+)=", earlier.get("run") or ""))

        needed = {"VERSION_NAME", "VERSION_CODE", "APK_NAME", "BUILD_TOOLS", "EXPECTED_CERT_SHA256"}
        self.assertTrue(needed <= declared, f"the workflow declares {sorted(declared)}, missing {sorted(needed - declared)}")


if __name__ == "__main__":
    unittest.main()
