declare module "cli-progress" {
  export type BarPayload = Record<string, unknown>;

  export interface FormatOptions {
    format?: string;
  }

  export type Preset = Record<string, unknown>;

  export class SingleBar {
    constructor(options?: FormatOptions, preset?: Preset);
    start(total: number, startValue: number, payload?: BarPayload): void;
    update(current: number, payload?: BarPayload): void;
    stop(): void;
  }

  export const Presets: {
    shades_classic: Preset;
  };

  const cliProgress: {
    SingleBar: typeof SingleBar;
    Presets: typeof Presets;
  };

  export default cliProgress;
}
