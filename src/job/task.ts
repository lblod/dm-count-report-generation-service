import { QueryEngine } from "@comunica/query-sparql";
import { PREFIXES } from "local-constants.js";
import { logger } from "logger.js";
import {
  DeleteBusyTasksInput,
  UpdateTaskStatusInput,
  WriteNewTaskInput,
  deleteBusyTasksTemplate,
  insertTaskTemplate,
  updateTaskStatusTemplate,
} from "queries/queries.js";
import {
  TemplatedInsert,
  TemplatedSelect,
  TemplatedUpdate,
} from "queries/templated-query.js";
import {
  DataMonitoringFunction,
  LogLevel,
  ProgressMessage,
  TaskStatus,
  TaskType,
  UpdateMessage,
} from "types.js";
import { EventEmitter } from "node:events";
import dayjs from "dayjs";
import { config } from "configuration.js";
import { durationWrapper } from "util/util.js";
import { TASK_FUNCTIONS } from "./task-functions-map.js";
import { Job } from "./job.js";
import { v4 as uuidv4 } from "uuid";

// TODO type checking for return value
export type TaskFunction = (
  progress: TaskProgress,
  ...args: any[]
) => Promise<any>;

export async function taskWrapper(
  wrapped: TaskFunction,
  progress: TaskProgress,
  ...args: any[]
): Promise<any> {
  progress.start();
  try {
    const result = await wrapped(progress, ...args);
    progress.return(result);
  } catch (e) {
    if (e instanceof Error) {
      progress.error(e);
    } else {
      throw new Error("Task function may only throw errors. Bad.");
    }
  }
}

class TaskProgress {
  _task: Task;
  _logLevel: LogLevel;
  _eventEmitter: EventEmitter;
  constructor(task: Task, logLevel: LogLevel = "info") {
    this._task = task;
    this._logLevel = logLevel;
    this._eventEmitter = new EventEmitter();
  }
  update(...args: any[]) {
    logger.log(this._logLevel, ...args);
    if (args.length === 0)
      throw new Error(`Cannot send update with no arguments`);
    const updateMessage: UpdateMessage = {
      timestamp: dayjs().format(),
      message: JSON.stringify(args),
    };
    this._eventEmitter.emit(`update`, updateMessage);
  }
  progress(
    done: number,
    total: number,
    lastDurationMilliseconds: number | null | undefined,
    subProcessIdentifier: string | undefined = undefined
  ) {
    logger.log(
      this._logLevel,
      `${
        subProcessIdentifier ? `(${subProcessIdentifier}) ` : ``
      }Progress update ${done}/${total} (${Math.round(
        (done / total) * 100.0
      )}%) ${lastDurationMilliseconds ? ` ${lastDurationMilliseconds} ms` : ``}`
    );
    const progressMessage: ProgressMessage = {
      done,
      total,
      lastDurationMilliseconds,
      subProcessIdentifier,
    };
    this._eventEmitter.emit(`progress`, progressMessage);
  }
  // Todo: Type check?
  async return(result: any) {
    (logger.log as any)(
      this._logLevel,
      `Status change of task ${this._task.uuid} to Finished`
    );
    await this._task.updateStatus(TaskStatus.FINISHED);
    const statusMessage = {
      done: true,
      failed: false,
      result,
    };
    this._eventEmitter.emit(`status`, statusMessage);
  }
  async error(error: object | number | string | boolean | Error) {
    (logger.log as any)(
      this._logLevel,
      `Status change of task ${this._task.uuid} to Error`
    );
    await this._task.updateStatus(TaskStatus.ERROR);
    const statusMessage = {
      done: true,
      failed: true,
      error,
    };
    this._eventEmitter.emit(`status`, statusMessage);
  }
  start() {
    logger.log(
      this._logLevel,
      `Status change of task ${this._task.uuid} to Busy`
    );
    const statusMessage = {
      done: false,
      failed: false,
    };
    this._eventEmitter.emit(`status`, statusMessage);
  }
}

export class Task {
  _progress: TaskProgress;
  _insertQuery: TemplatedInsert<WriteNewTaskInput>;
  _updateStatusQuery: TemplatedInsert<UpdateTaskStatusInput>;
  _graphUri: string;
  _job: Job;
  _taskType: TaskType;
  _uuid: string;
  _status: TaskStatus;
  _promises: Promise<any>[] = [];
  _createdAt: dayjs.Dayjs;
  _modifiedAt: dayjs.Dayjs;
  get createdAt() {
    return this._createdAt;
  }
  get modifiedAt() {
    return this._createdAt;
  }
  get status(): TaskStatus {
    return this._status;
  }
  get uuid() {
    return this._uuid;
  }
  get taskType() {
    return this._taskType;
  }

  get datamonitoringFunction() {
    return this._job.datamonitoringFunction;
  }

  get jobUri() {
    return this._job.uri;
  }

  get eventEmitter() {
    return this._progress._eventEmitter;
  }

  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    taskType: TaskType,
    graphUri: string,
    uuid: string,
    initialStatus: TaskStatus,
    job: Job
  ) {
    if (taskType === TaskType.PARALLEL) {
      throw new Error("Parallel type tasks not supported yet");
    }
    this._insertQuery = new TemplatedInsert<WriteNewTaskInput>(
      queryEngine,
      endpoint,
      insertTaskTemplate
    );
    this._updateStatusQuery = new TemplatedInsert<UpdateTaskStatusInput>(
      queryEngine,
      endpoint,
      updateTaskStatusTemplate
    );
    this._taskType = taskType;
    this._graphUri = graphUri;
    this._job = job;
    this._uuid = uuid;
    this._status = initialStatus;
    this._progress = new TaskProgress(this, "verbose");
    const now = dayjs();
    this._createdAt = now;
    this._modifiedAt = now;
  }

  get uri() {
    return `http://codifly.be/namespaces/job/task/${this._uuid}`;
  }

  async execute(...args: any[]) {
    // TODO. Support parallel tasks later
    if (this._promises.length) {
      throw new Error("Already executing. Parallel tasks not supported yet.");
    }
    // Make sure status is busy first
    if (this.status !== TaskStatus.BUSY) {
      await this.updateStatus(TaskStatus.BUSY);
    }
    await this._progress.start();
    const promise = durationWrapper(
      TASK_FUNCTIONS[this.datamonitoringFunction],
      "verbose",
      this._progress,
      ...args
    );
    this._promises.push(promise);
  }

  async updateStatus(status: TaskStatus) {
    const now = dayjs();
    await this._updateStatusQuery.execute({
      prefixes: PREFIXES,
      modifiedAt: now,
      status,
      jobGraphUri: config.env.JOB_GRAPH_URI,
      taskUri: this.uri,
    });
    this._status = status;
    this._modifiedAt = now;
  }

  async _createNewResource() {
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      uuid: this._uuid,
      jobGraphUri: this._graphUri,
      taskUri: this.uri,
      status: this._status,
      createdAt: this._createdAt,
      description: `Task created by dm-count-report-generation-service`,
      taskType: this._taskType,
      jobUri: this.jobUri,
      datamonitoringFunction: this.datamonitoringFunction,
      index: 0,
    });
  }
}

type DefaultTaskCreationSettings = {
  queryEngine: QueryEngine;
  endpoint: string;
};

let defaults: DefaultTaskCreationSettings | undefined = undefined;

const tasks = new Map<string, Task>();

export function getTasks(): Task[] {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  return [...tasks.values()];
}

export function getTask(uri: string): Task | undefined {
  return tasks.get(uri);
}

export function setTaskCreationDefaults(
  queryEngine: QueryEngine,
  endpoint: string
) {
  defaults = {
    queryEngine,
    endpoint,
  };
}

// export async function loadTasks() {
//   if (!defaults)
//     throw new Error(
//       `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
//     );
//   const getTasksQuery = new TemplatedSelect<GetTasksInput, GetTasksOutput>(
//     defaults.queryEngine,
//     defaults.endpoint,
//     getTasksTemplate
//   );
//   const taskRecords = await getTasksQuery.objects("taskUri", {
//     jobGraphUri: config.env.JOB_GRAPH_URI,
//     prefixes: PREFIXES,
//   });
//   // Create all of the tasks and put them in the map
//   for (const record of taskRecords) {
//     const newTask = new Task(
//       defaults.queryEngine,
//       defaults.endpoint,
//       record.taskType,
//       config.env.JOB_GRAPH_URI,
//       record.uuid,
//       record.status,
//       record.datamonitoringFunction
//     );
//     tasks.set(newTask.uri, newTask);
//   }
// }

export async function createTask(
  job: Job,
  taskType: TaskType.SERIAL,
  initialStatus = TaskStatus.NOT_STARTED
): Promise<Task> {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  const newTask = new Task(
    defaults.queryEngine,
    defaults.endpoint,
    taskType,
    config.env.JOB_GRAPH_URI,
    uuidv4(),
    initialStatus,
    job
  );
  await newTask._createNewResource();
  tasks.set(newTask.uri, newTask);
  return newTask;
}

// TODO: Make sure we don't delete a task with an async function running
export async function deleteBusyTasks() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  const deleteBusyTasksQuery = new TemplatedUpdate<DeleteBusyTasksInput>(
    defaults.queryEngine,
    defaults.endpoint,
    deleteBusyTasksTemplate
  );
  await deleteBusyTasksQuery.execute({
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
}
