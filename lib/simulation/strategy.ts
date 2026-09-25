import { TireCompoundName } from "@/lib/constants";

// Port of backend/strategy.py
export interface Strategy {
  pitStops: number[];
  tireSequence: TireCompoundName[];
  pitStopLoss: number;
}

export function createStrategy(
  pitStops: number[],
  tireSequence: TireCompoundName[],
  pitStopLoss = 21.0
): Strategy {
  return { pitStops, tireSequence, pitStopLoss };
}
