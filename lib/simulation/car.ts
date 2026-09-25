// Port of backend/car.py
export interface Car {
  baseLapTime: number;
  fuelEffect: number;
  paceDelta: number;
}

export function createCar(baseLapTime: number, fuelEffect = 0.05, paceDelta = 0.0): Car {
  return { baseLapTime, fuelEffect, paceDelta };
}
