"use client";
import { useEffect, useRef, useState } from "react";
import type { VideoWorkspaceController } from "@/lib/video-project/client-controller";
import {
  exportPortableProject,
  importPortableProject,
} from "@/lib/video-project/portable-project-client";
const labels: Record<string, string[]> = {
  en: [
    "Project package",
    "Export project package",
    "Import into empty project",
    "Preparing package…",
    "Reading package…",
    "Cancel",
    "Close",
    "Package ready.",
    "Project imported. Captions remain editable; new speech-based cuts need fresh transcription.",
    "Import into an empty project to keep your current timeline.",
    "Includes editable layers, media and fonts. Accounts, provider jobs and verified transcription history are not included.",
  ],
  zh: [
    "项目包",
    "导出项目包",
    "导入到空项目",
    "正在准备项目包…",
    "正在读取项目包…",
    "取消",
    "关闭",
    "项目包已准备好。",
    "项目已导入。字幕仍可编辑；新的语音剪辑需要重新转录。",
    "请导入到空项目，保留当前时间线。",
    "包含可编辑图层、媒体和字体，不包含账户、生成任务和已验证的转录记录。",
  ],
  es: [
    "Paquete del proyecto",
    "Exportar paquete",
    "Importar en proyecto vacío",
    "Preparando paquete…",
    "Leyendo paquete…",
    "Cancelar",
    "Cerrar",
    "Paquete listo.",
    "Proyecto importado. Los subtítulos siguen editables; nuevos cortes por voz requieren transcripción.",
    "Importa en un proyecto vacío para conservar la línea de tiempo.",
    "Incluye capas editables, medios y fuentes. No incluye cuentas, trabajos ni historial verificado de transcripción.",
  ],
  fr: [
    "Archive du projet",
    "Exporter le projet",
    "Importer dans un projet vide",
    "Préparation…",
    "Lecture de l’archive…",
    "Annuler",
    "Fermer",
    "Archive prête.",
    "Projet importé. Les sous-titres restent modifiables ; les nouvelles coupes vocales nécessitent une transcription.",
    "Importez dans un projet vide pour préserver le montage.",
    "Inclut calques, médias et polices. Comptes, tâches et historique de transcription vérifié sont exclus.",
  ],
  de: [
    "Projektpaket",
    "Projektpaket exportieren",
    "In leeres Projekt importieren",
    "Paket wird erstellt…",
    "Paket wird gelesen…",
    "Abbrechen",
    "Schließen",
    "Paket bereit.",
    "Projekt importiert. Untertitel bleiben editierbar; neue Sprachschnitte benötigen eine Transkription.",
    "In ein leeres Projekt importieren, um die Zeitleiste zu erhalten.",
    "Enthält Ebenen, Medien und Schriften. Konten, Aufträge und verifizierte Transkriptionshistorie sind ausgeschlossen.",
  ],
  it: [
    "Pacchetto progetto",
    "Esporta pacchetto",
    "Importa in un progetto vuoto",
    "Preparazione…",
    "Lettura del pacchetto…",
    "Annulla",
    "Chiudi",
    "Pacchetto pronto.",
    "Progetto importato. Sottotitoli modificabili; nuovi tagli vocali richiedono una trascrizione.",
    "Importa in un progetto vuoto per conservare la timeline.",
    "Include livelli, media e font. Esclude account, lavori e cronologia di trascrizione verificata.",
  ],
  pt: [
    "Pacote do projeto",
    "Exportar pacote",
    "Importar em projeto vazio",
    "Preparando pacote…",
    "Lendo pacote…",
    "Cancelar",
    "Fechar",
    "Pacote pronto.",
    "Projeto importado. Legendas continuam editáveis; novos cortes por fala exigem transcrição.",
    "Importe em um projeto vazio para preservar a linha do tempo.",
    "Inclui camadas, mídia e fontes. Não inclui contas, tarefas ou histórico de transcrição verificado.",
  ],
  ja: [
    "プロジェクトパッケージ",
    "パッケージを書き出す",
    "空のプロジェクトへ読み込む",
    "準備中…",
    "読み込み中…",
    "キャンセル",
    "閉じる",
    "準備できました。",
    "読み込みました。字幕は編集可能です。新たな音声ベースのカットには再文字起こしが必要です。",
    "現在のタイムラインを保つため、空のプロジェクトへ読み込んでください。",
    "レイヤー、メディア、フォントを含みます。アカウント、生成ジョブ、検証済み文字起こし履歴は含みません。",
  ],
  ko: [
    "프로젝트 패키지",
    "패키지 내보내기",
    "빈 프로젝트로 가져오기",
    "패키지 준비 중…",
    "패키지 읽는 중…",
    "취소",
    "닫기",
    "패키지가 준비되었습니다.",
    "프로젝트를 가져왔습니다. 자막은 편집 가능하며 새 음성 기반 편집에는 다시 전사가 필요합니다.",
    "현재 타임라인을 보존하려면 빈 프로젝트로 가져오세요.",
    "레이어, 미디어, 글꼴이 포함됩니다. 계정, 생성 작업, 검증된 전사 기록은 제외됩니다.",
  ],
};
export function EditorPortableProject({
  projectId,
  controller,
  name,
  sources,
  locale,
  onImported,
}: {
  projectId: string;
  controller: VideoWorkspaceController;
  name: string;
  sources: Record<string, string>;
  locale: string;
  onImported: (urls: Record<string, string>) => void;
}) {
  const t = labels[locale] ?? labels.en,
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController>(),
    urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      abort.current?.abort();
      urls.current.forEach(URL.revokeObjectURL);
    },
    [projectId],
  );
  const run = async (kind: "export" | "import", file?: File) => {
    if (busy) return;
    const controllerAbort = new AbortController();
    abort.current = controllerAbort;
    setBusy(true);
    setMessage(t[kind === "export" ? 3 : 4]);
    try {
      if (kind === "export") {
        const blob = await exportPortableProject(
            projectId,
            controller,
            name,
            sources,
            controllerAbort.signal,
          ),
          url = URL.createObjectURL(blob);
        urls.current.push(url);
        const link = document.createElement("a");
        link.href = url;
        link.download =
          (name.replace(/[^\p{L}\p{N}._-]+/gu, "-") || "project") +
          ".dojoproject";
        link.click();
        setMessage(t[7]);
      } else if (file) {
        const result = await importPortableProject(
            projectId,
            controller,
            file,
            controllerAbort.signal,
          ),
          next: Record<string, string> = {};
        for (const [id, blob] of result.files) {
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          next[id] = url;
        }
        onImported(next);
        setMessage(t[8]);
      }
    } catch (error) {
      setMessage(
        controllerAbort.signal.aborted
          ? t[5]
          : error instanceof Error
            ? error.message
            : String(error),
      );
    } finally {
      setBusy(false);
      abort.current = undefined;
    }
  };
  const empty =
    controller.getState().document?.items.length === 0 &&
    Object.keys(controller.getState().document?.assets ?? {}).length === 0;
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded border border-[var(--editor-border)] px-2 py-2 text-xs"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t[0]}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t[0]}
          className="fixed right-3 top-20 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-[var(--editor-border)] bg-[var(--editor-panel)] p-4 text-xs shadow-xl"
        >
          <p className="mb-3">{t[10]}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded border p-2"
              onClick={() => void run("export")}
            >
              {t[1]}
            </button>
            <button
              type="button"
              disabled={busy || !empty}
              className="rounded border p-2 disabled:opacity-50"
              onClick={() => input.current?.click()}
            >
              {t[2]}
            </button>
          </div>
          {!empty && <p className="mt-2">{t[9]}</p>}
          <p role="status" className="mt-2 break-words">
            {message}
          </p>
          {busy ? (
            <button
              className="mt-3 underline"
              onClick={() => abort.current?.abort()}
            >
              {t[5]}
            </button>
          ) : (
            <button className="mt-3 underline" onClick={() => setOpen(false)}>
              {t[6]}
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".dojoproject,application/x-dojo-project"
        aria-label={t[2]}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void run("import", file);
        }}
      />
    </div>
  );
}
