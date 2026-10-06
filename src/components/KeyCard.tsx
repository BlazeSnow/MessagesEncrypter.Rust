import { MoreHorizontal } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KeyEntry } from "@/lib/api";

export interface KeyCardAction {
  /** 资源键（多语言在渲染层解析）。 */
  labelKey: string;
  /** 菜单图标（下拉与右键菜单共用）。 */
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** 本项之前插入分隔线（动作分组：数据 → 管理 → 危险）。 */
  separatorBefore?: boolean;
}

/**
 * 密钥列表项：别名 + 指纹 + 类型徽章 + 操作菜单（对齐原版 SettingsCard 布局）。
 * 「更多」下拉与卡片右键菜单共用同一组动作。
 */
export function KeyCard({ entry, actions }: { entry: KeyEntry; actions: KeyCardAction[] }) {
  const menuItems = actions.map((action) => ({ ...action, label: action.labelKey }));
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
                {menuItems.map((item) => (
                  <Fragment key={item.labelKey}>
                    {item.separatorBefore ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      variant={item.danger ? "destructive" : "default"}
                      onSelect={item.onSelect}
                    >
                      {item.icon}
                      {item.label}
                    </DropdownMenuItem>
                  </Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuItems.map((item) => (
          <Fragment key={item.labelKey}>
            {item.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              variant={item.danger ? "destructive" : "default"}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
