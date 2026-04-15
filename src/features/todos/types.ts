export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type Todo = {
  content: string;
  status: TodoStatus;
  activeForm?: string;
};
