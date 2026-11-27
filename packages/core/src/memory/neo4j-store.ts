import neo4j from "neo4j-driver";
import type { EnsemblyKind, EnsemblyRecord, PulseMemory, WorkflowLesson } from "../state/schema.js";
import {
  listLessonsQuery,
  listPulseQuery,
  mergeEnsemblyRecord,
  mergeWorkflowLesson,
  promotePulse,
  schemaStatements,
  type BoundQuery,
} from "./cypher.js";
import type { LessonFilter, MemoryGraphStore } from "./port.js";
import { readLessonRow, readPulseRow, type CypherRow } from "./rows.js";

export interface CypherRunner {
  run(query: string, params: Record<string, unknown>): Promise<{ records: CypherRow[] }>;
}

export interface MemoryDriver {
  session(config?: { database?: string }): {
    executeRead<T>(work: (tx: CypherRunner) => Promise<T>): Promise<T>;
    executeWrite<T>(work: (tx: CypherRunner) => Promise<T>): Promise<T>;
    close(): Promise<void>;
  };
  close(): Promise<void>;
}

async function writeQuery(driver: MemoryDriver, database: string | undefined, query: BoundQuery): Promise<CypherRow[]> {
  const session = driver.session(database ? { database } : undefined);
  try {
    return await session.executeWrite(async (tx) => {
      const result = await tx.run(query.text, { ...query.params });
      return result.records;
    });
  } finally {
    await session.close();
  }
}

async function readQuery(driver: MemoryDriver, database: string | undefined, query: BoundQuery): Promise<CypherRow[]> {
  const session = driver.session(database ? { database } : undefined);
  try {
    return await session.executeRead(async (tx) => {
      const result = await tx.run(query.text, { ...query.params });
      return result.records;
    });
  } finally {
    await session.close();
  }
}

export class Neo4jMemoryStore implements MemoryGraphStore {
  constructor(
    private readonly driver: MemoryDriver,
    private readonly database?: string,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): Neo4jMemoryStore | null {
    const uri = env.NEO4J_URI;
    const password = env.NEO4J_PASSWORD;
    if (!uri || !password) return null;
    const username = env.NEO4J_USERNAME || "neo4j";
    const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
    const database = env.NEO4J_DATABASE;
    return new Neo4jMemoryStore(driver, database);
  }

  async ensureSchema(): Promise<void> {
    for (const text of schemaStatements) {
      await writeQuery(this.driver, this.database, { text, params: {} });
    }
  }

  async upsertRecord(record: EnsemblyRecord): Promise<void> {
    await writeQuery(this.driver, this.database, mergeEnsemblyRecord(record));
  }

  async promote(id: string): Promise<PulseMemory | null> {
    const records = await writeQuery(this.driver, this.database, promotePulse(id));
    const row = records[0];
    if (!row || row.get("id") == null) return null;
    return readPulseRow(row);
  }

  async recordLesson(lesson: WorkflowLesson): Promise<void> {
    for (const query of mergeWorkflowLesson(lesson)) {
      await writeQuery(this.driver, this.database, query);
    }
  }

  async listPulse(kind?: EnsemblyKind | null): Promise<PulseMemory[]> {
    const records = await readQuery(this.driver, this.database, listPulseQuery(kind ?? null));
    return records.map((row) => readPulseRow(row));
  }

  async listLessons(filter?: LessonFilter): Promise<WorkflowLesson[]> {
    const records = await readQuery(
      this.driver,
      this.database,
      listLessonsQuery({ phase: filter?.phase ?? null, cardId: filter?.cardId ?? null }),
    );
    return records.map((row) => readLessonRow(row));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
