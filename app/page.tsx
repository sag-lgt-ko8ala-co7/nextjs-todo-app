"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type Toast = {
  id: string;
  message: string;
  icon: ReactNode;
  undo?: () => void;
};

const STORAGE_KEY = "todos";
const HISTORY_KEY = "todo-history";
const HISTORY_LIMIT = 20;
const TOAST_DURATION_MS = 3000;
const UNDO_TOAST_DURATION_MS = 8000;
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100";
// スクロールする一覧の中では、外側に出す枠が切れるので内側に描く
const FOCUS_RING_INSET =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100";

const listeners = new Set<() => void>();
let todos: Todo[] | null = null;
let history: string[] | null = null;

function isTodo(value: unknown): value is Todo {
  const todo = value as Todo | null;
  return (
    typeof todo?.id === "string" &&
    typeof todo.text === "string" &&
    typeof todo.completed === "boolean"
  );
}

function loadTodos(): Todo[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.filter(isTodo) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): Todo[] {
  todos ??= loadTodos();
  return todos;
}

// 同じ文章は1件にまとめて先頭へ移し、古いものから上限を超えた分を捨てる
function addToHistory(list: string[], text: string): string[] {
  return [text, ...list.filter((item) => item !== text)].slice(
    0,
    HISTORY_LIMIT,
  );
}

function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored === null) {
      // 初回だけ今の ToDo を取り込む。保存しておかないと、取り込む前に
      // 削除された ToDo が履歴に残らない
      const seeded = getSnapshot().reduce<string[]>(
        (list, todo) => addToHistory(list, todo.text),
        [],
      );
      localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function getHistorySnapshot(): string[] {
  history ??= loadHistory();
  return history;
}

// サーバーには localStorage がないため、null を「読み込み前」として扱う
function getServerSnapshot(): null {
  return null;
}

function notify() {
  listeners.forEach((listener) => listener());
}

// 別タブでの変更を反映する（key が null なのは localStorage.clear() のとき）
function handleStorage(event: StorageEvent) {
  const cleared = event.key === null;
  if (!cleared && event.key !== STORAGE_KEY && event.key !== HISTORY_KEY) {
    return;
  }
  if (cleared || event.key === STORAGE_KEY) todos = loadTodos();
  if (cleared || event.key === HISTORY_KEY) history = loadHistory();
  notify();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", handleStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

// 保存に失敗しても画面上の状態は更新し、成否を返す
function saveTodos(next: Todo[]): boolean {
  todos = next;
  notify();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function saveHistory(next: string[]): boolean {
  history = next;
  notify();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

// crypto.randomUUID は HTTPS か localhost でしか使えないため使わない
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Icon({
  children,
  className = "size-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

function AlertIcon() {
  return (
    <Icon className="mt-0.5 size-5">
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5M12 18h.01" />
    </Icon>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m5 12 5 5L20 7" />
    </Icon>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
    </Icon>
  );
}

function UndoIcon() {
  return (
    <Icon>
      <path d="M8 5 4 9l4 4" />
      <path d="M4 9h10a5 5 0 0 1 0 10h-3" />
    </Icon>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M9 4h6v3H9zM9 5H6v16h12V5h-3" />
      <path d="m9 14 2 2 4-4" />
    </Icon>
  );
}

function HistoryIcon() {
  return (
    <Icon>
      <path d="M12 7v5l3 2" />
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

// 開いたときは先頭の「キャンセル」にフォーカスが入り、Enter の連打では実行されない
function ConfirmDialog({
  dialogRef,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose?: () => void;
}) {
  const id = useId();
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg bg-white p-6 text-black shadow-lg backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-50"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      <p
        id={`${id}-description`}
        className="mt-2 text-zinc-700 dark:text-zinc-300"
      >
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className={`min-h-11 cursor-pointer rounded-lg border border-zinc-500 px-4 text-base transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`min-h-11 cursor-pointer rounded-lg bg-red-700 px-4 text-base font-medium text-white transition hover:bg-red-800 dark:bg-red-300 dark:text-zinc-900 dark:hover:bg-red-200 ${FOCUS_RING}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

function Progress({ completed, total }: { completed: number; total: number }) {
  return (
    <section className="flex flex-col gap-2">
      <p id="progress-label" className="font-medium text-black dark:text-zinc-50">
        {total}件中{completed}件完了
      </p>
      <div
        role="progressbar"
        aria-labelledby="progress-label"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        className="h-3 overflow-hidden rounded-full border border-blue-700 bg-white dark:border-blue-300 dark:bg-zinc-900"
      >
        <div
          style={{ width: `${(completed / total) * 100}%` }}
          className="h-full bg-blue-700 motion-safe:transition-[width] motion-safe:duration-300 dark:bg-blue-300"
        />
      </div>
    </section>
  );
}

export default function Home() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const historyItems =
    useSyncExternalStore(subscribe, getHistorySnapshot, getServerSnapshot) ??
    [];
  const [text, setText] = useState("");
  const [inputActive, setInputActive] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showEmptyError, setShowEmptyError] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastPaused, setToastPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listAreaRef = useRef<HTMLDivElement>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);
  const clearHistoryDialogRef = useRef<HTMLDialogElement>(null);
  const historyListRef = useRef<HTMLUListElement>(null);

  const isLoading = items === null;
  const remaining = items?.filter((todo) => !todo.completed).length ?? 0;
  const completedCount = (items?.length ?? 0) - remaining;

  // 確認中に別タブで完了済みがなくなったら、消す対象がないので閉じる
  useEffect(() => {
    if (completedCount === 0) clearDialogRef.current?.close();
  }, [completedCount]);

  // 通知にマウスやフォーカスがある間は、操作の途中で消えないように止める
  useEffect(() => {
    if (!toast || toastPaused) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.undo ? UNDO_TOAST_DURATION_MS : TOAST_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [toast, toastPaused]);

  function commit(next: Todo[]) {
    setSaveFailed(!saveTodos(next));
  }

  function showToast(message: string, icon: ReactNode, undo?: () => void) {
    setToast({ id: createId(), message, icon, undo });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    const trimmed = text.trim();
    inputRef.current?.focus();
    if (trimmed === "") {
      setShowEmptyError(true);
      return;
    }
    const todosSaved = saveTodos([
      ...getSnapshot(),
      { id: createId(), text: trimmed, completed: false },
    ]);
    const historySaved = saveHistory(
      addToHistory(getHistorySnapshot(), trimmed),
    );
    setSaveFailed(!todosSaved || !historySaved);
    setText("");
    setShowEmptyError(false);
    setHistoryOpen(false);
    showToast("追加しました", <CheckIcon />);
  }

  function handleToggle(id: string) {
    commit(
      getSnapshot().map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
  }

  function handleUndoDelete(todo: Todo, index: number) {
    const next = [...getSnapshot()];
    next.splice(index, 0, todo);
    commit(next);
    setToastPaused(false);
    showToast("元に戻しました", <UndoIcon />);
    listAreaRef.current?.focus({ preventScroll: true });
  }

  function handleDelete(todo: Todo, index: number) {
    // 押したボタンが消えるとフォーカスを見失うので、隣の削除ボタンへ移す
    const buttons =
      listAreaRef.current?.querySelectorAll<HTMLButtonElement>("[data-delete]");
    const neighbor = buttons?.[index + 1] ?? buttons?.[index - 1];
    (neighbor ?? listAreaRef.current)?.focus({ preventScroll: true });
    commit(getSnapshot().filter((item) => item.id !== todo.id));
    showToast("削除しました", <TrashIcon />, () =>
      handleUndoDelete(todo, index),
    );
  }

  function handleClearCompleted() {
    const current = getSnapshot();
    const next = current.filter((todo) => !todo.completed);
    clearDialogRef.current?.close();
    commit(next);
    showToast(`${current.length - next.length}件削除しました`, <TrashIcon />);
    // 開くときに押したボタンが消えるので、リストへフォーカスを移す
    listAreaRef.current?.focus({ preventScroll: true });
  }

  function handleSelectHistory(item: string) {
    setText(item);
    setShowEmptyError(false);
    setHistoryOpen(false);
    inputRef.current?.focus();
  }

  function handleDeleteHistory(item: string, index: number) {
    // キーボード操作中に押したボタンが消えるとフォーカスを見失うので、隣へ移す
    const list = historyListRef.current;
    if (list?.contains(document.activeElement)) {
      const buttons = list.querySelectorAll<HTMLButtonElement>(
        "[data-history-delete]",
      );
      (buttons[index + 1] ?? buttons[index - 1] ?? inputRef.current)?.focus();
    }
    const next = getHistorySnapshot().filter((entry) => entry !== item);
    setSaveFailed(!saveHistory(next));
    if (next.length === 0) setHistoryOpen(false);
  }

  function handleClearHistory() {
    setSaveFailed(!saveHistory([]));
    clearHistoryDialogRef.current?.close();
    showToast("履歴を消去しました", <TrashIcon />);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-blue-50 px-4 pt-12 pb-32 font-sans sm:pt-20 dark:bg-zinc-950">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight whitespace-nowrap text-black dark:text-zinc-50">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white dark:bg-blue-300 dark:text-zinc-900">
              <ClipboardIcon className="size-6" />
            </span>
            ToDoリスト
          </h1>
          {items !== null && items.length > 0 && (
            <p className="flex shrink-0 items-center gap-1 rounded-full border border-blue-700 bg-white px-3 py-1 font-medium text-blue-800 dark:border-blue-300 dark:bg-zinc-900 dark:text-blue-200">
              {remaining === 0 ? (
                <>
                  <CheckIcon />
                  すべて完了
                </>
              ) : (
                `残り ${remaining} 件`
              )}
            </p>
          )}
        </header>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div
              className="relative min-w-0 flex-1"
              onFocus={() => setInputActive(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setInputActive(false);
                  setHistoryOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && historyOpen) {
                  setHistoryOpen(false);
                  inputRef.current?.focus();
                }
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setShowEmptyError(false);
                }}
                disabled={isLoading}
                placeholder="やることを入力"
                aria-label="追加するやること"
                aria-invalid={showEmptyError}
                aria-describedby={showEmptyError ? "empty-error" : undefined}
                className={`min-h-12 w-full rounded-lg border bg-white pr-20 pl-4 text-base text-black outline-none placeholder:text-zinc-500 focus:ring-1 disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400 ${
                  showEmptyError
                    ? "border-red-700 ring-1 ring-red-700 dark:border-red-400 dark:ring-red-400"
                    : "border-zinc-400 focus:border-blue-700 focus:ring-blue-700 dark:border-zinc-600 dark:focus:border-blue-300 dark:focus:ring-blue-300"
                }`}
              />
              {inputActive && historyItems.length > 0 && (
                <button
                  type="button"
                  // 押す瞬間に入力欄の選択が外れてボタンが消えないようにする
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-expanded={historyOpen}
                  aria-controls="history-panel"
                  className={`absolute top-0.5 right-1 flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 text-base text-blue-800 transition hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
                >
                  <HistoryIcon />
                  履歴
                </button>
              )}
              {historyOpen && historyItems.length > 0 && (
                <div
                  id="history-panel"
                  onMouseDown={(event) => event.preventDefault()}
                  className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-zinc-400 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
                >
                  <ul
                    ref={historyListRef}
                    aria-label="入力の履歴"
                    className="max-h-72 overflow-y-auto"
                  >
                    {historyItems.map((item, index) => (
                      <li key={item} className="flex items-stretch">
                        <button
                          type="button"
                          onClick={() => handleSelectHistory(item)}
                          className={`min-h-11 min-w-0 flex-1 cursor-pointer px-4 py-2 text-left text-base wrap-anywhere text-black hover:bg-blue-50 dark:text-zinc-50 dark:hover:bg-zinc-800 ${FOCUS_RING_INSET}`}
                        >
                          {item}
                        </button>
                        <button
                          type="button"
                          data-history-delete
                          onClick={() => handleDeleteHistory(item, index)}
                          aria-label={`「${item}」を履歴から削除`}
                          title="履歴から削除"
                          className={`grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center text-zinc-700 hover:bg-red-50 hover:text-red-800 dark:text-zinc-300 dark:hover:bg-red-950 dark:hover:text-red-200 ${FOCUS_RING_INSET}`}
                        >
                          <CloseIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-end border-t border-zinc-300 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => clearHistoryDialogRef.current?.showModal()}
                      className={`min-h-11 cursor-pointer px-4 text-base text-red-800 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950 ${FOCUS_RING_INSET}`}
                    >
                      すべて消去
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className={`flex min-h-12 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-blue-700 pr-4 pl-3 text-base font-medium text-white transition hover:bg-blue-800 motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-300 dark:text-zinc-900 dark:hover:bg-blue-200 ${FOCUS_RING}`}
            >
              <PlusIcon />
              追加
            </button>
          </div>
          {showEmptyError && (
            <p
              id="empty-error"
              role="alert"
              className="flex gap-2 text-red-800 dark:text-red-300"
            >
              <AlertIcon />
              やることを入力してください
            </p>
          )}
        </form>

        {saveFailed && (
          <p
            role="alert"
            className="flex gap-2 rounded-lg border border-red-700 bg-red-50 px-4 py-3 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100"
          >
            <AlertIcon />
            保存できませんでした。このページを閉じると、変更が消えることがあります。
          </p>
        )}

        {items !== null && items.length > 0 && (
          <Progress completed={completedCount} total={items.length} />
        )}

        <div ref={listAreaRef} tabIndex={-1} className="outline-none">
          {isLoading ? (
            <p
              role="status"
              className="flex items-center justify-center gap-3 py-8 text-zinc-700 dark:text-zinc-300"
            >
              <span
                aria-hidden="true"
                className="size-5 rounded-full border-2 border-blue-200 border-t-blue-700 motion-safe:animate-spin dark:border-zinc-700 dark:border-t-blue-300"
              />
              読み込み中…
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-blue-300 px-4 py-10 text-center text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
              <ClipboardIcon className="size-12 text-blue-700 dark:text-blue-300" />
              <p>やることはまだありません。</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((todo, index) => (
                <li
                  key={todo.id}
                  className={`flex gap-1 rounded-lg border pr-2 transition-colors ${
                    todo.completed
                      ? "border-dashed border-zinc-500 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-950"
                      : "border-zinc-300 border-l-4 border-l-blue-700 bg-white shadow-sm dark:border-zinc-700 dark:border-l-blue-300 dark:bg-zinc-900"
                  }`}
                >
                  <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-4">
                    <span className="relative grid size-7 shrink-0 place-items-center">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggle(todo.id)}
                        className={`peer size-7 cursor-pointer appearance-none rounded-full border-2 border-zinc-500 bg-white transition-colors checked:border-blue-700 checked:bg-blue-700 dark:border-zinc-400 dark:bg-zinc-900 dark:checked:border-blue-300 dark:checked:bg-blue-300 ${FOCUS_RING}`}
                      />
                      <CheckIcon className="pointer-events-none absolute size-5 text-white opacity-0 peer-checked:opacity-100 dark:text-zinc-900" />
                    </span>
                    <span
                      className={`min-w-0 wrap-anywhere ${
                        todo.completed
                          ? "text-zinc-600 line-through dark:text-zinc-400"
                          : "text-black dark:text-zinc-50"
                      }`}
                    >
                      {todo.text}
                    </span>
                  </label>
                  <button
                    type="button"
                    data-delete
                    onClick={() => handleDelete(todo, index)}
                    aria-label={`「${todo.text}」を削除`}
                    className={`my-0.5 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center gap-1 self-center rounded-md px-2 text-base text-zinc-700 transition hover:bg-red-50 hover:text-red-800 motion-safe:active:scale-95 dark:text-zinc-300 dark:hover:bg-red-950 dark:hover:text-red-200 ${FOCUS_RING}`}
                  >
                    <TrashIcon />
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {completedCount > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => clearDialogRef.current?.showModal()}
              className={`flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-zinc-500 bg-white px-3 text-base text-zinc-800 transition hover:border-red-700 hover:bg-red-50 hover:text-red-800 motion-safe:active:scale-95 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-red-400 dark:hover:bg-red-950 dark:hover:text-red-200 ${FOCUS_RING}`}
            >
              <TrashIcon />
              完了済みをまとめて削除
            </button>
          </div>
        )}
      </main>

      <ConfirmDialog
        dialogRef={clearDialogRef}
        title={`完了済みの${completedCount}件を削除しますか？`}
        description="削除すると元に戻せません。"
        confirmLabel="削除する"
        onConfirm={handleClearCompleted}
      />
      <ConfirmDialog
        dialogRef={clearHistoryDialogRef}
        title="履歴をすべて消去しますか？"
        description="消去すると元に戻せません。ToDoリストは消えません。"
        confirmLabel="消去する"
        onConfirm={handleClearHistory}
        // 開く前の一覧は閉じているので、戻り先がなくならないよう入力欄へ戻す
        onClose={() => inputRef.current?.focus()}
      />

      <div
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center"
      >
        {toast && (
          <div
            key={toast.id}
            onPointerEnter={() => setToastPaused(true)}
            onPointerLeave={() => setToastPaused(false)}
            onFocus={() => setToastPaused(true)}
            onBlur={() => setToastPaused(false)}
            className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-lg bg-zinc-900 px-4 text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
          >
            {toast.icon}
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={toast.undo}
                className="-mr-2 min-h-11 cursor-pointer rounded-md px-2 text-base font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-current"
              >
                元に戻す
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
