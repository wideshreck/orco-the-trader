import type { Todo } from './types.js';

type Sink = (todos: Todo[]) => void;

let currentSink: Sink | null = null;

export function setTodoSink(sink: Sink | null): void {
  currentSink = sink;
}

export function writeTodos(todos: Todo[]): void {
  if (currentSink) currentSink(todos);
}
