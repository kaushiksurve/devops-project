"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Cpu,
  GitBranch,
  GitCommitHorizontal,
  Layers3,
  LockKeyhole,
  Play,
  Rocket,
  ShieldCheck,
  Terminal,
  TestTube2,
  XCircle,
} from "lucide-react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type PipelineStatus = "pending" | "running" | "success" | "failed";

export interface PipelineStage {
  id: string;
  name: string;
  status: PipelineStatus;
  detail: string;
  duration: string;
  icon: "build" | "test" | "security" | "deploy";
  cpu: number;
  memory: number;
}

export interface PipelineLog {
  id: string;
  time: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
}

export interface PipelineWorkflowProps {
  runId?: string;
  commitHash?: string;
  branch?: string;
  environment?: string;
  initialStages?: PipelineStage[];
  initialLogs?: PipelineLog[];
  onDeploy: () => void | Promise<void>;
}

const defaultStages: PipelineStage[] = [
  {
    id: "build",
    name: "Build",
    status: "success",
    detail: "Docker image built and tagged for this commit.",
    duration: "1m 24s",
    icon: "build",
    cpu: 42,
    memory: 38,
  },
  {
    id: "test",
    name: "Test",
    status: "success",
    detail: "Unit and integration test suites passed.",
    duration: "2m 08s",
    icon: "test",
    cpu: 26,
    memory: 47,
  },
  {
    id: "security",
    name: "Security Scan",
    status: "success",
    detail: "Dependency and container image scans found no blockers.",
    duration: "0m 52s",
    icon: "security",
    cpu: 61,
    memory: 54,
  },
  {
    id: "deploy",
    name: "Deploy to Prod",
    status: "pending",
    detail: "Production deployment is waiting for manual approval.",
    duration: "—",
    icon: "deploy",
    cpu: 8,
    memory: 18,
  },
];

const defaultLogs: PipelineLog[] = [
  {
    id: "log-1",
    time: "18:42:08",
    stage: "build",
    message: "Container image taskflow:4f82b1a built successfully.",
    level: "success",
  },
  {
    id: "log-2",
    time: "18:43:32",
    stage: "test",
    message: "All 42 unit and integration tests passed.",
    level: "success",
  },
  {
    id: "log-3",
    time: "18:44:24",
    stage: "security",
    message: "Security scan complete. No critical vulnerabilities found.",
    level: "success",
  },
];

const stageIcons = {
  build: Layers3,
  test: TestTube2,
  security: ShieldCheck,
  deploy: Rocket,
} as const;

const statusCopy: Record<PipelineStatus, string> = {
  pending: "Pending",
  running: "Running",
  success: "Passed",
  failed: "Failed",
};

const statusColors: Record<PipelineStatus, string> = {
  pending: "border-zinc-700 bg-zinc-900 text-zinc-400",
  running: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  failed: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

export function DotGridBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(148,163,184,0.17)_1px,transparent_1.2px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_88%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(99,102,241,0.025)_50%,transparent_100%)] opacity-60" />
      <motion.div
        className="absolute -inset-x-1/4 top-0 h-1/2 bg-gradient-to-b from-cyan-400/[0.035] via-indigo-400/[0.025] to-transparent blur-3xl"
        animate={reduceMotion ? undefined : { y: ["-15%", "145%", "-15%"] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.66)_100%)]" />
    </div>
  );
}

export function LatticeLoader({ label = "Runner active" }: { label?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <span
      role="img"
      aria-label={label}
      className="relative grid h-10 w-10 grid-cols-3 grid-rows-3 gap-1 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-1.5"
    >
      {Array.from({ length: 9 }, (_, index) => (
        <motion.span
          key={index}
          className="rounded-[2px] bg-amber-300/80 shadow-[0_0_8px_rgba(252,211,77,0.45)]"
          animate={
            reduceMotion
              ? undefined
              : { opacity: [0.18, 0.95, 0.18], scale: [0.75, 1, 0.75] }
          }
          transition={{
            duration: 1.05,
            repeat: Infinity,
            delay: index * 0.075,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

export function StatusMark({ status }: { status: PipelineStatus }) {
  const reduceMotion = useReducedMotion();
  const Icon =
    status === "success"
      ? CheckCircle2
      : status === "failed"
        ? XCircle
        : status === "running"
          ? Activity
          : Circle;

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        statusColors[status],
      )}
      aria-label={`Status: ${statusCopy[status]}`}
    >
      {status === "running" && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-amber-300/20"
          animate={reduceMotion ? undefined : { scale: [1, 1.5], opacity: [0.65, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      <Icon aria-hidden="true" className="relative z-[1] h-3.5 w-3.5" />
      <span className="relative z-[1]">{statusCopy[status]}</span>
    </span>
  );
}

function TelemetryGauge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const circumference = 2 * Math.PI * 26;
  const spring = useSpring(Math.min(100, Math.max(0, value)), {
    stiffness: 85,
    damping: 19,
    mass: 0.7,
  });
  const offset = useTransform(spring, [0, 100], [circumference, 0]);
  const rounded = useTransform(spring, (current) => `${Math.round(current)}%`);

  useEffect(() => {
    spring.set(Math.min(100, Math.max(0, value)));
  }, [spring, value]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-16 w-16 shrink-0 place-items-center">
        <svg viewBox="0 0 64 64" className="-rotate-90">
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="rgba(148,163,184,.13)"
            strokeWidth="5"
          />
          <motion.circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: offset }}
          />
        </svg>
        <motion.span className="absolute text-xs font-semibold tabular-nums text-zinc-100">
          {rounded}
        </motion.span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <p className="mt-1 text-xs text-zinc-300">Runner utilization</p>
      </div>
    </div>
  );
}

export function DecryptedText({
  text,
  className,
  revealKey,
}: {
  text: string;
  className?: string;
  revealKey?: string | number;
}) {
  const reduceMotion = useReducedMotion();
  const [visibleText, setVisibleText] = useState(text);
  const progress = useRef(0);
  const revealIdentity = revealKey ?? text;

  useEffect(() => {
    if (reduceMotion) {
      setVisibleText(text);
      return;
    }

    const alphabet = "ABCDEF0123456789#$%&";
    progress.current = 0;
    setVisibleText(
      text
        .split("")
        .map((char) => (char === " " ? " " : alphabet[Math.floor(Math.random() * alphabet.length)]))
        .join(""),
    );
    const timer = window.setInterval(() => {
      progress.current = Math.min(text.length, progress.current + 1);
      setVisibleText(
        text
          .split("")
          .map((char, index) => {
            if (char === " " || index < progress.current) return char;
            return alphabet[Math.floor(Math.random() * alphabet.length)];
          })
          .join(""),
      );
      if (progress.current >= text.length) window.clearInterval(timer);
    }, 36);

    return () => window.clearInterval(timer);
  }, [text, revealIdentity, reduceMotion]);

  return (
    <span className={className} aria-label={text} aria-live="off">
      <span aria-hidden="true">{visibleText}</span>
    </span>
  );
}

export function LaserFlowConnector({
  active,
  completed,
  label,
}: {
  active: boolean;
  completed: boolean;
  label: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative hidden h-12 min-w-10 flex-1 items-center md:flex" aria-hidden="true">
      <svg viewBox="0 0 120 24" preserveAspectRatio="none" className="h-6 w-full overflow-visible">
        <defs>
          <linearGradient id={`laser-${label.replaceAll(" ", "-")}`} x1="0" x2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <path
          d="M2 12 H112 l-7 -6 M112 12 l-7 6"
          fill="none"
          stroke={completed ? "rgba(52,211,153,.5)" : "rgba(113,113,122,.38)"}
          strokeWidth="1.5"
        />
        {active && (
          <motion.path
            d="M2 12 H112"
            fill="none"
            stroke={`url(#laser-${label.replaceAll(" ", "-")})`}
            strokeLinecap="round"
            strokeWidth="2.5"
            strokeDasharray="12 26"
            initial={{ strokeDashoffset: 76, opacity: 0.5 }}
            animate={reduceMotion ? { opacity: 0.8 } : { strokeDashoffset: -76, opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        )}
      </svg>
    </div>
  );
}

export function PipelineStageNode({
  stage,
  index,
  selected,
  onSelect,
}: {
  stage: PipelineStage;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = stageIcons[stage.icon];
  const isRunning = stage.status === "running";

  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      aria-label={`${stage.name}, ${statusCopy[stage.status]}. Open stage details.`}
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      whileHover={{ y: -3 }}
      className={cn(
        "group relative flex min-h-[172px] w-full min-w-[190px] flex-1 flex-col rounded-2xl border bg-zinc-950/80 p-4 text-left shadow-[0_12px_45px_rgba(0,0,0,.22)] backdrop-blur-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70",
        selected ? "border-indigo-400/55 ring-1 ring-indigo-400/20" : "border-white/[0.08] hover:border-white/20",
        stage.status === "running" && "border-amber-300/35",
        stage.status === "failed" && "border-rose-400/35",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-xl border",
            stage.status === "success"
              ? "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300"
              : stage.status === "running"
                ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200"
                : stage.status === "failed"
                  ? "border-rose-400/20 bg-rose-400/[0.07] text-rose-300"
                  : "border-zinc-700/70 bg-zinc-900 text-zinc-400",
          )}
        >
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
        <StatusMark status={stage.status} />
      </div>
      <span className="mt-5 block text-sm font-semibold tracking-tight text-zinc-100">{stage.name}</span>
      <span className="mt-1 text-[11px] text-zinc-500">
        {stage.status === "running" ? "Runner active" : `Duration ${stage.duration}`}
      </span>
      <span className="absolute bottom-4 right-4">
        {isRunning ? (
          <LatticeLoader label={`${stage.name} runner is running`} />
        ) : stage.status === "success" ? (
          <Check aria-hidden="true" className="h-4 w-4 text-emerald-300/70" />
        ) : stage.status === "failed" ? (
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-rose-300/80" />
        ) : (
          <Clock3 aria-hidden="true" className="h-4 w-4 text-zinc-600" />
        )}
      </span>
    </motion.button>
  );
}

export function SlideCommitApproval({
  disabled,
  busy,
  onDeploy,
}: {
  disabled: boolean;
  busy: boolean;
  onDeploy: () => void | Promise<void>;
}) {
  const holdTimer = useRef<number | undefined>(undefined);
  const triggered = useRef(false);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState("");
  const HOLD_MS = 1400;

  const cancelHold = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    setHolding(false);
  }, []);

  const beginHold = useCallback(() => {
    if (disabled || busy || holding) return;
    setError("");
    triggered.current = false;
    setHolding(true);
    holdTimer.current = window.setTimeout(async () => {
      triggered.current = true;
      setHolding(false);
      try {
        await onDeploy();
      } catch {
        setError("Deployment approval failed. Check the deployment log and try again.");
      }
    }, HOLD_MS);
  }, [busy, disabled, holding, onDeploy]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelHold();
  };

  const help = disabled
    ? "Complete all preceding pipeline stages before approving production."
    : busy
      ? "A production deployment is already being approved."
      : "Press and hold for 1.4 seconds to approve production deployment.";

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || busy}
        aria-describedby="deploy-approval-help"
        aria-label={holding ? "Keep holding to approve deployment" : "Hold to approve production deployment"}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          beginHold();
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelHold}
        onLostPointerCapture={cancelHold}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            beginHold();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            cancelHold();
          }
        }}
        onBlur={cancelHold}
        className={cn(
          "relative flex h-12 w-full select-none items-center justify-center gap-2 overflow-hidden rounded-xl border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 disabled:cursor-not-allowed disabled:opacity-45",
          holding
            ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100"
            : "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200 hover:border-emerald-300/45 hover:bg-emerald-400/[0.13]",
        )}
      >
        <motion.span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 origin-left bg-emerald-300/15"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: holding ? 1 : 0 }}
          transition={{ duration: holding ? HOLD_MS / 1000 : 0.12, ease: "linear" }}
        />
        <LockKeyhole aria-hidden="true" className="relative h-4 w-4" />
        <span className="relative">{holding ? "Keep holding to approve…" : "Hold to approve deployment"}</span>
      </button>
      <p id="deploy-approval-help" className="text-[11px] leading-relaxed text-zinc-500">
        {help}
      </p>
      <p role="alert" className="min-h-4 text-[11px] text-rose-300">
        {error}
      </p>
    </div>
  );
}

function DeploymentLog({ logs }: { logs: PipelineLog[] }) {
  const levelStyle: Record<PipelineLog["level"], string> = {
    info: "text-cyan-300",
    success: "text-emerald-300",
    warning: "text-amber-300",
    error: "text-rose-300",
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/70 shadow-[0_16px_50px_rgba(0,0,0,.2)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Terminal aria-hidden="true" className="h-4 w-4 text-zinc-500" />
          <h3 className="text-xs font-semibold tracking-wide text-zinc-200">Deployment log</h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">LIVE · {logs.length} EVENTS</span>
      </div>
      <div
        aria-label="Live deployment events"
        aria-live="polite"
        className="max-h-56 min-h-28 space-y-0.5 overflow-y-auto p-2 sm:p-3"
      >
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              layout
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, height: 0, margin: 0 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-[62px_72px_1fr] gap-2 rounded-lg px-2 py-2 font-mono text-[10px] leading-relaxed hover:bg-white/[0.025] sm:grid-cols-[72px_92px_1fr] sm:gap-3 sm:text-[11px]"
            >
              <time className="text-zinc-600">{log.time}</time>
              <span className="truncate text-indigo-300/80">[{log.stage}]</span>
              <span className={cn("min-w-0 break-words text-zinc-400", levelStyle[log.level])}>
                {log.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {logs.length === 0 && (
          <p className="px-3 py-7 text-center text-xs text-zinc-600">Waiting for pipeline events…</p>
        )}
      </div>
    </div>
  );
}

export function PipelineWorkflow({
  runId = "run-02481",
  commitHash = "4f82b1a",
  branch = "main",
  environment = "production",
  initialStages = defaultStages,
  initialLogs = defaultLogs,
  onDeploy,
}: PipelineWorkflowProps) {
  const [stages, setStages] = useState(() => initialStages);
  const [logs, setLogs] = useState(() => initialLogs);
  const [selectedStageId, setSelectedStageId] = useState(initialStages[0]?.id ?? "");
  const [deploying, setDeploying] = useState(false);
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) ?? stages[0];
  const deployStage = stages[stages.length - 1];
  const prerequisitesPassed = stages.slice(0, -1).every((stage) => stage.status === "success");
  const isPipelineRunning = stages.some((stage) => stage.status === "running");
  const stagesSignature = JSON.stringify(initialStages);
  const logsSignature = JSON.stringify(initialLogs);

  useEffect(() => {
    setStages((current) => (JSON.stringify(current) === stagesSignature ? current : initialStages));
  }, [initialStages, stagesSignature]);

  useEffect(() => {
    setLogs((current) => (JSON.stringify(current) === logsSignature ? current : initialLogs));
  }, [initialLogs, logsSignature]);

  const approveDeployment = useCallback(async () => {
    setDeploying(true);
    try {
      await onDeploy();
      const now = new Date();
      const time = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setStages((current) =>
        current.map((stage) =>
          stage.id === deployStage?.id ? { ...stage, status: "running" } : stage,
        ),
      );
      setLogs((current) => [
        {
          id: `deploy-${Date.now()}`,
          time,
          stage: deployStage?.id ?? "deploy",
          message: `Manual approval accepted. Deploying ${commitHash} to ${environment}.`,
          level: "info",
        },
        ...current,
      ]);
    } finally {
      setDeploying(false);
    }
  }, [commitHash, deployStage?.id, environment, onDeploy]);

  if (stages.length === 0) {
    return (
      <main className="relative isolate min-h-screen overflow-hidden bg-[#0a0a0c] text-zinc-100">
        <DotGridBackground />
        <div className="mx-auto max-w-5xl px-5 py-16 text-center text-sm text-zinc-400">
          No pipeline stages are configured.
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen bg-[#0a0a0c] text-zinc-100 selection:bg-indigo-400/25">
      <DotGridBackground />
      <div className="relative z-10 mx-auto max-w-[1440px] px-4 py-8 sm:px-7 sm:py-12 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-300/80">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.8)]" />
              Taskflow · CI/CD
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Pipeline workflow
            </h1>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500 sm:text-sm">
              Review each stage, inspect runner telemetry, and approve production when the checks pass.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[10px] text-zinc-400 sm:justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2">
              <GitCommitHorizontal aria-hidden="true" className="h-3.5 w-3.5 text-indigo-300" />
              <DecryptedText text={`git-sha: ${commitHash}`} revealKey={runId} />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2">
              <GitBranch aria-hidden="true" className="h-3.5 w-3.5 text-cyan-300" />
              <DecryptedText text={branch} revealKey={`${runId}-branch`} />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2">
              <Play aria-hidden="true" className="h-3 w-3 text-emerald-300" />
              <DecryptedText text={`BUILD ${runId}`} revealKey={`${runId}-run`} />
            </span>
          </div>
        </header>

        <section aria-label="Pipeline stages" className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Release sequence
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isPipelineRunning
                    ? "animate-pulse bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,.75)]"
                    : "bg-emerald-300",
                )}
              />
              {isPipelineRunning ? "Jobs running" : "Checks complete"}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3 md:items-center md:gap-2">
            {stages.map((stage, index) => (
              <div key={stage.id} className="flex min-w-[190px] flex-1 items-center gap-2">
                <PipelineStageNode
                  stage={stage}
                  index={index}
                  selected={stage.id === selectedStage?.id}
                  onSelect={() => setSelectedStageId(stage.id)}
                />
                {index < stages.length - 1 && (
                  <LaserFlowConnector
                    label={`${stage.id}-${stages[index + 1].id}`}
                    active={stage.status === "running" || stages[index + 1].status === "running"}
                    completed={stage.status === "success"}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {selectedStage && (
          <motion.section
            key={selectedStage.id}
            aria-labelledby="stage-inspector-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="mb-5 grid gap-4 rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-4 shadow-[0_16px_50px_rgba(0,0,0,.2)] backdrop-blur-xl sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.85fr)]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="stage-inspector-title" className="text-sm font-semibold text-zinc-100">
                  {selectedStage.name}
                </h2>
                <StatusMark status={selectedStage.status} />
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400">
                {selectedStage.detail}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                  Duration: {selectedStage.duration}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Terminal aria-hidden="true" className="h-3.5 w-3.5" />
                  Runner: linux-x64
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <DecryptedText
                    text={`env: ${environment}`}
                    revealKey={`${runId}-env`}
                    className="font-mono text-cyan-200/80"
                  />
                </span>
              </div>
              {selectedStage.id === deployStage?.id && (
                <div className="mt-5 max-w-md border-t border-white/[0.07] pt-4">
                  <SlideCommitApproval
                    disabled={!prerequisitesPassed || selectedStage.status === "failed"}
                    busy={deploying || selectedStage.status === "running"}
                    onDeploy={approveDeployment}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:p-4">
              <TelemetryGauge label="CPU" value={selectedStage.cpu} color="#22d3ee" />
              <TelemetryGauge label="Memory" value={selectedStage.memory} color="#a78bfa" />
            </div>
          </motion.section>
        )}

        <DeploymentLog logs={logs} />
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <Cpu aria-hidden="true" className="h-3.5 w-3.5" />
            Runner telemetry updates with the selected stage
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
            {branch} → {environment}
          </span>
        </footer>
      </div>
    </main>
  );
}

export default PipelineWorkflow;
