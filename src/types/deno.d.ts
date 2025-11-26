/// <reference types="https://deno.land/x/deno@v1.37.1/mod.d.ts" />

declare namespace Deno {
  export interface Args {
    [key: string]: string;
  }

  export function readTextFile(path: string): Promise<string>;
  export function writeTextFile(path: string, data: string): Promise<void>;
  export function readDir(path: string): AsyncIterable<DirEntry>;
  export function exit(code: number): never;

  export interface DirEntry {
    name: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }
} 