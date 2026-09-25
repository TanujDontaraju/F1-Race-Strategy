// Port of backend/driver.py
export interface Driver {
  name: string;
}

export function createDriver(name: string): Driver {
  return { name };
}
