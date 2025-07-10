import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const RUN_DIR_ENV = "MMRY_RUN_DIR";
const RUN_DIR = process.env[RUN_DIR_ENV];

const OUT_DIR = `${RUN_DIR}/out`;
const IN_DIR = `${RUN_DIR}/in`;

export type MmryItem = {
  /** The id of the item in the external system/source */
  externalId?: string;
  /** The textual content of the item */
  content: string;
  /** The href of the item */
  href?: string;
  /** The date the item was created */
  createdAt?: number | string | Date;
  /** The date the item was updated */
  updatedAt?: number | string | Date;
  /** The urls associated with the item */
  urls?: string[];
  /** The images associated with the item */
  images?: string[];
} & { [key: string]: string | object | number | boolean | null };

export interface MmryInput {
  id: string;
  value: string;
}

let stateInstance: LowSync<any> | null = null; // Singleton instance
const stateProxyHandler: ProxyHandler<LowSync<any>> = {
  get(target, prop, receiver) {
    if (prop === "read" || prop === "write") {
      // Directly call read/write on the Low instance with proper binding
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
    // Access properties on the .data object
    return Reflect.get(target.data, prop, receiver);
  },
  set(target, prop, value, receiver) {
    // Set properties on the .data object
    target.data[prop] = value;
    return true; // Indicate success
  },
};

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export const mmry = {
  // Initialize the state instance on first call and return a proxy
  state<T>(defaultData: T): Prettify<Pick<LowSync<T>, "write"> & T> {
    if (!stateInstance) {
      const adapter = new JSONFileSync<T>(`${RUN_DIR}/data.json`);
      stateInstance = new LowSync(adapter, defaultData);
      // Perform initial read when instance is created
      stateInstance.read();
      // If data is null (file doesn't exist), initialize with default data
      if (stateInstance.data === null) {
        stateInstance.data = defaultData;
        stateInstance.write();
      }
    }
    // Return the proxy wrapping the singleton instance
    // Cast to LowSync<T> & T to allow direct property access via proxy
    return new Proxy(stateInstance, stateProxyHandler) as LowSync<T> & T;
  },

  info() {
    console.log("mmry.info");
  },
  time(message?: string) {
    const time = new Date().toLocaleTimeString();
    console.log(`[MMRY] ${time} ${message ? message : ""}`);
    return time;
  },

  /** Emit a status message, which is displayed in the plugin UI. Message should not contain newlines. */
  status(message: string) {
    console.log(`<mmry_status>${message}</mmry_status>`);
  },

  env(id?: string) {
    if (id) return process.env[id];

    return Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("_"))
    );
  },
  input(id: string) {
    return mmry.inputs().find((i) => i.id === id);
  },
  inputs() {
    const env = mmry.env("MMRY_INPUTS");
    if (!env) return [];
    return JSON.parse(env as string) as MmryInput[];
  },

  inputFile(id: string) {
    // ? todo: implement copy input files toggle in run UI (to ./files)
    const input = mmry.input(id);
    if (!input) return undefined;

    try {
      const stat = fs.statSync(input.value);
      return { path: fs.realpathSync(input.value), stat };
    } catch (e) {
      console.error(e);
      return undefined;
    }
  },

  *items() {
    const entries = fs.readdirSync(IN_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(IN_DIR, entry.name);
      const content = fs.readFileSync(filePath, "utf8");
      yield JSON.parse(content) as MmryItem & { id: string };
    }
  },

  add(obj: MmryItem) {
    if (!obj) return;

    // make sure obj.createdAt is in date format
    if (obj?.createdAt && !(obj.createdAt instanceof Date)) {
      obj.createdAt = new Date(
        typeof obj.createdAt === "string"
          ? Number(obj.createdAt)
          : obj.createdAt
      );
    }

    // make sure obj.updatedAt is in date format
    if (obj?.updatedAt && !(obj.updatedAt instanceof Date)) {
      obj.updatedAt = new Date(
        typeof obj.updatedAt === "string"
          ? Number(obj.updatedAt)
          : obj.updatedAt
      );
    }

    const fileName = path.join(OUT_DIR, `${randomUUID()}.json`);
    fs.writeFileSync(fileName, JSON.stringify(obj));
    console.log(`[MMRY] Added ${fileName}`);
  },
  addMany: (objs: MmryItem[]) => {
    for (const obj of objs) {
      mmry.add(obj);
    }
  },
  update(obj: MmryItem & { id: string }) {
    // No need to check for obj.id anymore, TypeScript ensures it
    const fileName = path.join(OUT_DIR, `${obj.id}.json`);
    fs.writeFileSync(fileName, JSON.stringify(obj));
    console.log(`[MMRY] Updated ${fileName}`);
  },
  updateMany: (objs: (MmryItem & { id: string })[]) => {
    for (const obj of objs) {
      mmry.update(obj);
    }
  },
};
