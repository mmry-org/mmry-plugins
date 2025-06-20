import { LowSync } from "npm:lowdb@6.1.1";
import { JSONFileSync } from "npm:lowdb@6.1.1/node";

const RUN_DIR_ENV = "MMRY_RUN_DIR";
const RUN_DIR = Deno.env.get(RUN_DIR_ENV);

const OUT_DIR = `${RUN_DIR}/out`;
const IN_DIR = `${RUN_DIR}/in`;

export type MmryItem = {
  /** The id of the item in the external system/source */
  externalId?: string;
  /** The textual content of the item */
  content: string;
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
      // Directly call read/write on the Low instance
      return Reflect.get(target, prop, receiver);
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

export const mmry = {
  // Initialize the state instance on first call and return a proxy
  state<T>(defaultData: T): LowSync<T> & T {
    if (!stateInstance) {
      const adapter = new JSONFileSync<T>(`${RUN_DIR}/data.json`);
      stateInstance = new LowSync(adapter, defaultData);
      // Perform initial read when instance is created
      stateInstance.read();
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
    if (id) return Deno.env.get(id);

    return Object.fromEntries(
      Object.entries(Deno.env.toObject()).filter(
        ([key]) => !key.startsWith("_")
      )
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
      const stat = Deno.statSync(input.value);
      return { path: Deno.realPathSync(input.value), stat };
    } catch (e) {
      console.error(e);
      return undefined;
    }
  },

  *items() {
    for (const entry of Deno.readDirSync(IN_DIR)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const filePath = `${IN_DIR}/${entry.name}`;
      const content = Deno.readTextFileSync(filePath);
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

    const fileName = `${OUT_DIR}/${crypto.randomUUID()}.json`;
    Deno.writeTextFileSync(fileName, JSON.stringify(obj));
    console.log(`[MMRY] Added ${fileName}`);
  },
  addMany: (objs: MmryItem[]) => {
    for (const obj of objs) {
      mmry.add(obj);
    }
  },
  update(obj: MmryItem & { id: string }) {
    // No need to check for obj.id anymore, TypeScript ensures it
    const fileName = `${OUT_DIR}/${obj.id}.json`;
    Deno.writeTextFileSync(fileName, JSON.stringify(obj));
    console.log(`[MMRY] Updated ${fileName}`);
  },
  updateMany: (objs: (MmryItem & { id: string })[]) => {
    for (const obj of objs) {
      mmry.update(obj);
    }
  },
};

// PLUGIN //////////////////////////////////////////////////////////////////////
console.log("mmry.env()");
console.log(mmry.env());

// // Initialize the statebase with default data if needed
// const state = mmry.state({ posts: [] });

// // Now access data properties directly via the proxy
// state.posts.push(`hello world ${mmry.time()}`);
// const _firstPost = state.posts[0];

// // Write changes using the proxy's write method
// state.write();

// console.log("state", state.data); // Access underlying data if needed (though proxy allows direct access)
