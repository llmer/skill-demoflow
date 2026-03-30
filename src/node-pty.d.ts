declare module 'node-pty' {
  export interface IPty {
    write(data: string): void
    resize(cols: number, rows: number): void
    onData(callback: (data: string) => void): { dispose(): void }
    onExit(callback: (e: { exitCode: number; signal?: number }) => void): { dispose(): void }
    kill(signal?: string): void
    pid: number
  }

  export function spawn(
    file: string,
    args: string[],
    options: {
      name?: string
      cols?: number
      rows?: number
      cwd?: string
      env?: Record<string, string>
    },
  ): IPty
}
