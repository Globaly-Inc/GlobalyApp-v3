import { FileText } from "lucide-react";
import { ProfileSection } from "../../../components/profile/profile-section";

export function CourseDescription({ description }: Readonly<{ description: string | null }>) {
  return (
    <ProfileSection icon={FileText} title="Course Description">
      {description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{description}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No description available.</p>
      )}
    </ProfileSection>
  );
}
