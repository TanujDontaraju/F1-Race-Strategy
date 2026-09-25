import { Car } from "@/lib/simulation/car";
import { Driver } from "@/lib/simulation/driver";
import { Strategy } from "@/lib/simulation/strategy";
import { TireCompound, TireCompoundName } from "@/lib/constants";

export interface LapResult {
  lapNumber: number;
  lapTime: number;
  tireAge: number;
  isPitStop: boolean;
  tireCompound: TireCompoundName;
}

// Port of backend/simulation_engine.py's SimulationEngine.run_simulation.
// Kept line-for-line equivalent to the Python version so results match.
export function runSimulation(
  totalLaps: number,
  car: Car,
  _driver: Driver,
  strategy: Strategy,
  tireCompounds: Record<TireCompoundName, TireCompound>
): LapResult[] {
  const lapData: LapResult[] = [];
  let tireAge = 0;
  let stintIndex = 0;
  let currentTireName = strategy.tireSequence[stintIndex];

  for (let lap = 1; lap <= totalLaps; lap++) {
    tireAge += 1;

    const currentTire = tireCompounds[currentTireName];

    const degradationEffect = tireAge * currentTire.degradation;
    const fuelCorrection = (totalLaps - lap) * car.fuelEffect;
    const tirePerformanceOffset = currentTire.offset;

    let lapTime =
      car.baseLapTime + car.paceDelta + degradationEffect - fuelCorrection + tirePerformanceOffset;

    const isPitStop = strategy.pitStops.includes(lap);
    if (isPitStop) {
      lapTime += strategy.pitStopLoss;
    }

    lapData.push({
      lapNumber: lap,
      lapTime,
      tireAge,
      isPitStop,
      tireCompound: currentTireName,
    });

    if (isPitStop) {
      tireAge = 0;
      stintIndex += 1;
      if (stintIndex < strategy.tireSequence.length) {
        currentTireName = strategy.tireSequence[stintIndex];
      }
    }
  }

  return lapData;
}
