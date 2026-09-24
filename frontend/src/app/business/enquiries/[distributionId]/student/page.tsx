import { StudentProfileView } from "@/app/business/enquiries/components/student-profile-view";

/**
 * The student behind one enquiry. Addressed by DISTRIBUTION id, not student id: what a business is
 * allowed to see is a property of the lead it paid for, never of the person — so there is no URL
 * here that lets one business reach a student it has no unlocked distribution for.
 */
export default async function EnquiryStudentProfilePage({
  params,
}: Readonly<{ params: Promise<{ distributionId: string }> }>) {
  const { distributionId } = await params;
  return <StudentProfileView distributionId={distributionId} />;
}
