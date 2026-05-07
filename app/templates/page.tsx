import { TemplatesView } from "@/components/templates/TemplatesView";

export default function TemplatesPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
        <p className="text-muted-foreground mt-1">
          Reusable, column-agnostic message templates.
        </p>
      </header>
      <TemplatesView />
    </div>
  );
}
