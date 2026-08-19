import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DEGREE_LEVEL_OPTIONS } from "../const";

function levelLabel(level: string) {
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DegreeLevelPicker({
  value,
  onChange,
}: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {DEGREE_LEVEL_OPTIONS.map((level) => (
        <Label key={level} className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={value.includes(level)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, level] : value.filter((v) => v !== level))
            }
          />
          {levelLabel(level)}
        </Label>
      ))}
    </div>
  );
}
