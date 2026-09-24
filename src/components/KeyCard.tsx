import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KeyEntry } from "@/lib/api";

export interface KeyCardAction {
  /** 资源键（多语言在渲染层解析）。 */
  labelKey: string;
  onSelect: () => void;
  danger?: boolean;
}

/** 密钥列表项：别名 + 指纹 + 类型徽章 + 操作菜单（对齐原版 SettingsCard 布局）。 */
export function KeyCard({ entry, actions }: { entry: KeyEntry; actions: KeyCardAction[] }) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{entry.alias}</CardTitle>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {entry.fingerprint}
          </p>
        </div>
        {entry.keyType ? <Badge variant="secondary">{entry.keyType}</Badge> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="more">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.labelKey}
                variant={action.danger ? "destructive" : "default"}
                onSelect={action.onSelect}
              >
                {action.labelKey}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
    </Card>
  );
}
