pluginManagement {
    repositories {
        // AGP is published on Google Maven; omitting it here fails with a misleading error.
        google()
        // Prefer Google's GCS Maven Central mirror so fresh GitHub Actions runners avoid repo.maven.apache.org HTTP 429 throttling.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2") }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Serve Maven Central artifacts through Google's CDN mirror first, keeping mavenCentral() as fallback.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2") }
        mavenCentral()
    }
}

rootProject.name = "trindade-android"
include(":app")
