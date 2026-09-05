"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { LuPlus, LuX } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BlocklistTerm } from "@/types/domain";

interface BlocklistSettingsSectionProps {
  terms: BlocklistTerm[];
  onAddTerm: (term: string) => void;
  onRemoveTerm: (id: string) => void;
}

export function BlocklistSettingsSection({ terms, onAddTerm, onRemoveTerm }: BlocklistSettingsSectionProps) {
  const t = useTranslations("settings.blocklist");
  const [newTerm, setNewTerm] = React.useState("");

  const handleAdd = () => {
    if (!newTerm.trim()) return;
    onAddTerm(newTerm);
    setNewTerm("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {terms.map((term) => (
              <div
                key={term.id}
                className="inline-flex items-center gap-2 rounded-md bg-secondary py-1.5 pr-1.5 pl-3.5 text-[13px] font-medium text-secondary-foreground"
              >
                <span>{term.term}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveTerm(term.id)}
                  aria-label={t("removeTerm", { term: term.term })}
                  className="size-5 rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
                >
                  <LuX className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2.5 border-t border-border pt-5">
          <Input
            type="text"
            placeholder={t("addPlaceholder")}
            value={newTerm}
            onChange={(event) => setNewTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
            className="flex-1"
          />
          <Button type="button" onClick={handleAdd}>
            <LuPlus />
            {t("addButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
