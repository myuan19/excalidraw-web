import { useEffect, useState } from "react";

import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="absolute right-sm top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        onClick={() => setVisible((v) => !v)}
      >
        <span
          className={cn(
            "text-lg",
            visible ? "icon-[mdi--eye-off-outline]" : "icon-[mdi--eye-outline]",
          )}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-xs">
      <span className="field-label text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function AIConfigSection() {
  const aiConfig = useSettingsStore((s) => s.aiConfig);
  const aiConfigLoaded = useSettingsStore((s) => s.aiConfigLoaded);
  const aiConfigSaving = useSettingsStore((s) => s.aiConfigSaving);
  const aiConfigError = useSettingsStore((s) => s.aiConfigError);
  const loadAIConfig = useSettingsStore((s) => s.loadAIConfig);
  const saveAIConfig = useSettingsStore((s) => s.saveAIConfig);

  const [draft, setDraft] = useState(aiConfig);

  useEffect(() => {
    if (!aiConfigLoaded) {
      void loadAIConfig();
    }
  }, [aiConfigLoaded, loadAIConfig]);

  useEffect(() => {
    setDraft(aiConfig);
  }, [aiConfig]);

  const excalidraw = draft.excalidraw;
  const mindmap = draft.mindmap;

  function patchExcalidraw(
    updates: Partial<typeof excalidraw>,
  ) {
    setDraft((d) => ({
      ...d,
      excalidraw: { ...d.excalidraw, ...updates },
    }));
  }

  function patchMindmap(updates: Partial<typeof mindmap>) {
    setDraft((d) => ({
      ...d,
      mindmap: { ...d.mindmap, ...updates },
    }));
  }

  async function handleSave() {
    await saveAIConfig(draft);
  }

  function handleCancel() {
    setDraft(aiConfig);
  }

  return (
    <div className="space-y-xl">
      <Card>
        <CardHeader>
          <CardTitle>Excalidraw AI</CardTitle>
          <CardDescription>白板编辑器的 AI 能力配置</CardDescription>
        </CardHeader>
        <div className="space-y-lg">
          <Field label="Base URL">
            <Input
              value={excalidraw.endpoint}
              onChange={(e) => patchExcalidraw({ endpoint: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="API Key">
            <PasswordInput
              value={excalidraw.apiKey}
              onChange={(v) => patchExcalidraw({ apiKey: v })}
              placeholder="sk-..."
            />
          </Field>
          <Field label="文本→图模型">
            <Input
              value={excalidraw.textToDiagramModel}
              onChange={(e) =>
                patchExcalidraw({ textToDiagramModel: e.target.value })
              }
              placeholder="gpt-4o"
            />
          </Field>
          <Field label="图→代码模型">
            <Input
              value={excalidraw.diagramToCodeModel}
              onChange={(e) =>
                patchExcalidraw({ diagramToCodeModel: e.target.value })
              }
              placeholder="gpt-4o"
            />
          </Field>
          <Field label="图标标签模型">
            <Input
              value={excalidraw.iconTagModel}
              onChange={(e) =>
                patchExcalidraw({ iconTagModel: e.target.value })
              }
              placeholder="gpt-4o-mini"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MindMap AI</CardTitle>
          <CardDescription>思维导图的 AI 能力配置</CardDescription>
        </CardHeader>
        <div className="space-y-lg">
          <Field label="Base URL">
            <Input
              value={mindmap.endpoint}
              onChange={(e) => patchMindmap({ endpoint: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="API Key">
            <PasswordInput
              value={mindmap.apiKey}
              onChange={(v) => patchMindmap({ apiKey: v })}
              placeholder="sk-..."
            />
          </Field>
          <Field label="生成模型">
            <Input
              value={mindmap.model}
              onChange={(e) => patchMindmap({ model: e.target.value })}
              placeholder="gpt-4o"
            />
          </Field>
        </div>
      </Card>

      <p className="settings-copy text-muted">
        配置保存在服务器，同一部署下所有浏览器共享。AI
        请求由浏览器直连你填写的 Base URL。
      </p>
      {aiConfigError && (
        <p className="settings-copy text-danger">AI 配置服务暂不可用：{aiConfigError}</p>
      )}

      <div className="flex justify-end gap-sm">
        <Button variant="secondary" onClick={handleCancel}>
          取消
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={aiConfigSaving}>
          {aiConfigSaving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
