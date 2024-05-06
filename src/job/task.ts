import { QueryEngine } from "@comunica/query-sparql";
import { PREFIXES } from "local-constants.js";
import { logger } from "logger.js";
import {
  DeleteTaskInput,
  GetTasksInput,
  GetTasksOutput,
  UpdateTaskStatusInput,
  WriteNewTaskInput,
  deleteTaskTemplate,
  getTasksTemplate,
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

export type TaskFunction<R> = (
  progress: TaskProgress,
  ...args: any[]
) => Promise<R>;

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
      timestamp: dayjs(),
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
      }Progress update ${done}/^${total} (${Math.round(
        (done / total) * 100.0
      )}%${lastDurationMilliseconds ? ` ${lastDurationMilliseconds} ms` : ``}`
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
  async start() {
    (logger.log as any)(
      this._logLevel,
      `Status change of task ${this._task.uuid} to Busy`
    );
    await this._task.updateStatus(TaskStatus.BUSY);
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
  _datamonitoringFunction: DataMonitoringFunction;
  _taskType: TaskType;
  _uuid: string;
  _status: TaskStatus;
  _logLevel: LogLevel;
  get status(): TaskStatus {
    return this._status;
  }
  get uuid() {
    return this._uuid;
  }
  get taskType() {
    return this._taskType;
  }

  constructor(
    taskType: TaskType,
    queryEngine: QueryEngine,
    endpoint: string,
    graphUri: string,
    uuid: string,
    initialStatus: TaskStatus,
    datamonitoringFunction: DataMonitoringFunction,
    logLevel: LogLevel = "info"
  ) {
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
    this._datamonitoringFunction = datamonitoringFunction;
    this._uuid = uuid;
    this._status = initialStatus;
    this._logLevel = logLevel;
    this._progress = new TaskProgress(this, this._logLevel);
  }

  get uri() {
    return `http://codifly.be/namespaces/job/task/${this._uuid}`;
  }

  async execute(...args: any[]) {
    await this._progress.start();
    const result = await durationWrapper(
      TASK_FUNCTIONS[this._datamonitoringFunction],
      "verbose",
      this._progress,
      ...args
    );
    if (this.status !== TaskStatus.FINISHED) this._progress.return(result);
  }

  async updateStatus(status: TaskStatus) {
    await this._updateStatusQuery.execute({
      prefixes: PREFIXES,
      modifiedAt: dayjs(),
      status,
      jobGraphUri: config.env.JOB_GRAPH_URI,
      taskUri: this.uri,
    });
    this._status = status;
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

export async function loadTasks() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  const getTasksQuery = new TemplatedSelect<GetTasksInput, GetTasksOutput>(
    defaults.queryEngine,
    defaults.endpoint,
    getTasksTemplate
  );
  const taskRecords = await getTasksQuery.objects("taskUri", {
    jobGraphUri: config.env.JOB_GRAPH_URI,
    prefixes: PREFIXES,
  });
  // Create all of the tasks and put them in the map
  for (const record of taskRecords) {
    const newTask = new Task(
      record.taskType,
      defaults.queryEngine,
      defaults.endpoint,
      config.env.JOB_GRAPH_URI,
      record.uuid,
      record.status,
      record.datamonitoringFunction
    );
    tasks.set(newTask.uri, newTask);
  }
}

// TODO: Make sure we don't delete a task with an async function running
export async function deleteTask(task: string | Task) {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  const defaultedTask = (() => {
    if (task instanceof Task) return task;
    if (typeof task === "string") {
      const fromMap = tasks.get(task);
      if (!fromMap)
        throw new Error(
          `Task with URI ${task} was set up for deletion but it was never loaded.`
        );
      return fromMap;
    }
    throw new TypeError("Type of first parameter should be string or Task");
  })();
  const deleteTaskQuery = new TemplatedUpdate<DeleteTaskInput>(
    defaults.queryEngine,
    defaults.endpoint,
    deleteTaskTemplate
  );
  await deleteTaskQuery.execute({
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
    taskUri: defaultedTask.uri,
  });
  tasks.delete(defaultedTask.uri);
}
