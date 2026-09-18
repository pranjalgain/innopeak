"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { LuPlus, LuShieldBan, LuX } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { BlocklistTerm } from "@/types/domain";

interface BlocklistSettingsSectionProps {
  terms: BlocklistTerm[];
  onAddTerm: (term: string) => Promise<boolean>;
  onRemoveTerm: (id: string) => void | Promise<void>;
}

export function BlocklistSettingsSection({
  terms,
  onAddTerm,
  onRemoveTerm,
}: BlocklistSettingsSectionProps) {
  const t = useTranslations("settings.blocklist");
  const [newTerm, setNewTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newTerm.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const added = await onAddTerm(newTerm);
      if (added) setNewTerm("");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuShieldBan className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {terms.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {terms.map((term, index) => (
              <div
                key={term.id}
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                className="bg-secondary text-secondary-foreground animate-in fade-in zoom-in-95 fill-mode-backwards ease-fluid motion-reduce:animate-none hover:bg-secondary/70 inline-flex items-center gap-2 rounded-md py-1.5 pr-1.5 pl-3.5 text-[13px] font-medium transition-colors duration-300">
                <span>{term.term}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void onRemoveTerm(term.id)}
                  aria-label={t("removeTerm", { term: term.term })}
                  className="text-muted-foreground hover:bg-background/60 hover:text-foreground size-5 rounded-full">
                  <LuX className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="border-border flex gap-2.5 border-t pt-5">
          <Input
            type="text"
            placeholder={t("addPlaceholder")}
            value={newTerm}
            onChange={(event) => setNewTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleAdd();
              }
            }}
            className="flex-1"
          />
          <Button type="button" onClick={() => void handleAdd()} disabled={isAdding}>
            <LuPlus />
            {t("addButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
