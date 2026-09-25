import { CodeXml, FolderOpen, Globe, Info, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { openExportFolder } from "@/lib/keyFiles";
import { showErrorToast, showStatusToast } from "@/lib/status";
import { initI18n, LANGUAGE_EN_US, LANGUAGE_ZH_HANS, LANGUAGE_AUTO } from "@/i18n";

/** 设置页：显示语言、导出目录、仓库 / 网站 / 版本。 */
export function SettingsPage() {
  const { t } = useTranslation();
  const [displayLanguage, setDisplayLanguage] = useState(LANGUAGE_AUTO);
  const [exportFolder, setExportFolder] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await api.getAppSettings();
        setDisplayLanguage(settings.displayLanguage);
        setExportFolder(settings.exportFolder);
      } catch {
        // 完整性异常时保持默认展示。
      }
      try {
        setVersion(await api.getAppVersion());
      } catch {
        setVersion("");
      }
    })();
  }, []);

  const handleLanguageChange = async (value: string) => {
    setBusy(true);
    try {
      await api.setSetting("DisplayLanguage", value);
      await initI18n(value);
      setDisplayLanguage(value);
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const handleChooseFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected !== "string") {
      return;
    }
    try {
      await api.setSetting("ExportFolderPath", selected);
      setExportFolder(selected);
      showStatusToast("StatusExportFolderSaved");
    } catch (error) {
      showErrorToast(error);
    }
  };

  const openExternal = async (url: string) => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-5 text-primary" />
            {t("DisplayLanguageSettingsCard.Header")}
          </CardTitle>
          <CardDescription>{t("DisplayLanguageSettingsCard.Description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Select value={displayLanguage} onValueChange={(value) => void handleLanguageChange(value)}>
            <SelectTrigger className="w-56" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LANGUAGE_AUTO}>{t("LanguageAuto")}</SelectItem>
              <SelectItem value={LANGUAGE_ZH_HANS}>{t("LanguageZhHans")}</SelectItem>
              <SelectItem value={LANGUAGE_EN_US}>{t("LanguageEnUs")}</SelectItem>
            </SelectContent>
          </Select>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-5 text-primary" />
            {t("ExportFolderSettingsCard.Header")}
          </CardTitle>
          <CardDescription className="break-all">
            {exportFolder ?? t("ExportFolderSettingsCard.Description")}
          </CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button variant="outline" onClick={() => void handleChooseFolder()}>
            {t("ChooseExportFolderButton.Text")}
          </Button>
          <Button variant="outline" onClick={() => void openExportFolder()}>
            {t("OpenExportFolderButton.Text")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CodeXml className="size-5 text-primary" />
            {t("RepositorySettingsCard.Header")}
          </CardTitle>
          <CardDescription>{t("RepositorySettingsCard.Description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => void openExternal(t("RepositoryUrl"))}>
            {t("OpenButton.Text")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-5 text-primary" />
            {t("WebsiteSettingsCard.Header")}
          </CardTitle>
          <CardDescription>{t("WebsiteSettingsCard.Description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => void openExternal(t("WebsiteUrl"))}>
            {t("OpenButton.Text")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-5 text-primary" />
            {t("VersionSettingsCard.Header")}
          </CardTitle>
        </CardHeader>
        <CardFooter>
          <span className="font-mono text-sm text-muted-foreground">{version}</span>
        </CardFooter>
      </Card>

    </div>
  );
}
