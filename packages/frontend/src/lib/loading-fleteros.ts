/**
 * Los fleteros de un lote cuyo número se conoce: los únicos a los que un mensaje privado puede llegar.
 *
 * Se arma desde el lote y no desde el plantel: mandar el horario de un día a un conductor que no está en él es un
 * mensaje sobre un día que no le concierne. La regla vive acá y no en cada pantalla para que la puerta «Enviar a
 * fleteros» y el diálogo que la abre no puedan discrepar sobre quiénes son.
 */
export interface LoadingFletero {
  id: number;
  name: string;
  phone?: string | null;
  driver_type?: string;
}

export interface LoadingScheduleRow {
  driver_id?: number | null;
}

export function fleterosWithPhone(
  schedules: readonly LoadingScheduleRow[],
  drivers: readonly LoadingFletero[],
): LoadingFletero[] {
  const assigned = new Set(
    schedules.map((row) => row.driver_id).filter((id): id is number => typeof id === 'number'),
  );
  return drivers.filter(
    (driver) => driver.driver_type === 'fletero' && Boolean(driver.phone?.trim()) && assigned.has(driver.id),
  );
}
