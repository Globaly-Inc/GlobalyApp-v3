import { configureStore } from "@reduxjs/toolkit"
import { signupReducer } from "@/app/signup/store/signup-slice"
import { authReducer } from "@/app/auth/store/auth-slice"
import { profileReducer } from "@/app/personal/store/profile-slice"
import { businessOnboardingReducer } from "@/app/business/store/business-onboarding-slice"
import { adminReducer } from "@/app/admin/store/admin-slice"
import { overviewReducer } from "@/app/admin/overview/store/overview-slice"
import { usersReducer } from "@/app/admin/platform/users/store/users-slice"
import { businessesReducer } from "@/app/admin/platform/businesses/store/businesses-slice"
import { categoriesReducer } from "@/app/admin/platform/categories/store/categories-slice"
import { countriesReducer } from "@/app/admin/platform/countries/store/countries-slice"
import { featureFlagsReducer } from "@/app/admin/platform/feature-flags/store/feature-flags-slice"
import { allExtractionsReducer } from "@/app/admin/data/all-extractions/store/all-extractions-slice"
import { extractedDataReducer } from "@/app/admin/data/extracted-data/store/extracted-data-slice"
import { agentcisImportReducer } from "@/app/admin/data/agentcis-import/store/agentcis-import-slice"
import { aiExtractionReducer } from "@/app/admin/data/ai-extraction/store/ai-extraction-slice"
import { aiMemoryReducer } from "@/app/admin/data/ai-memory/store/ai-memory-slice"
import { aiKnowledgeReducer } from "@/app/admin/data/ai-knowledge/store/ai-knowledge-slice"
import { visasReducer } from "@/app/admin/data/visas/store/visas-slice"
import { maraAgentsReducer } from "@/app/admin/data/mara-agents/store/mara-agents-slice"
import { enquiriesReducer } from "@/app/admin/monitoring/enquiries/store/enquiries-slice"
import { moderationReducer } from "@/app/admin/monitoring/moderation/store/moderation-slice"
import { scholarshipsReducer } from "@/app/admin/monitoring/scholarships/store/scholarships-slice"
import { jobsReducer } from "@/app/admin/monitoring/jobs/store/jobs-slice"
import { eventsReducer } from "@/app/admin/monitoring/events/store/events-slice"
import { trainingReducer } from "@/app/admin/monitoring/training/store/training-slice"
import { ambassadorProgramsReducer } from "@/app/admin/monitoring/ambassador-programs/store/ambassador-programs-slice"
import { logsReducer } from "@/app/admin/monitoring/monitoring-logs/store/logs-slice"

export const makeStore = () => {
    return configureStore({
        reducer: {
            signup: signupReducer,
            auth: authReducer,
            profile: profileReducer,
            businessOnboarding: businessOnboardingReducer,
            admin: adminReducer,
            overview: overviewReducer,
            adminUsers: usersReducer,
            platformBusinesses: businessesReducer,
            platformCategories: categoriesReducer,
            platformCountries: countriesReducer,
            platformFeatureFlags: featureFlagsReducer,
            dataAllExtractions: allExtractionsReducer,
            dataExtractedData: extractedDataReducer,
            dataAgentcisImport: agentcisImportReducer,
            dataAiExtraction: aiExtractionReducer,
            dataAiMemory: aiMemoryReducer,
            dataAiKnowledge: aiKnowledgeReducer,
            dataVisas: visasReducer,
            dataMaraAgents: maraAgentsReducer,
            monitoringEnquiries: enquiriesReducer,
            monitoringModeration: moderationReducer,
            monitoringScholarships: scholarshipsReducer,
            monitoringJobs: jobsReducer,
            monitoringEvents: eventsReducer,
            monitoringTraining: trainingReducer,
            monitoringAmbassadorPrograms: ambassadorProgramsReducer,
            monitoringLogs: logsReducer,
        }
    })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
