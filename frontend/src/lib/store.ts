import { combineReducers, configureStore } from "@reduxjs/toolkit"
import { signupReducer } from "@/app/signup/store/signup-slice"
import { authReducer } from "@/app/auth/store/auth-slice"
import { profileReducer } from "@/app/personal/store/profile-slice"
import { homeReducer } from "@/app/personal/portal/store/home-slice"
import { myServicesReducer } from "@/app/personal/earn/services/store/my-services-slice"
import { businessOnboardingReducer } from "@/app/business/store/business-onboarding-slice"
import { businessProfileDetailReducer } from "@/app/business/profile/store/business-profile-detail-slice"
import { businessEventsReducer } from "@/app/business/events/store/business-events-slice"
import { adminReducer } from "@/app/admin/store/admin-slice"
import { overviewReducer } from "@/app/admin/overview/store/overview-slice"
import { usersReducer } from "@/app/admin/platform/users/store/users-slice"
import { businessesReducer } from "@/app/admin/platform/businesses/store/businesses-slice"
import { categoriesReducer } from "@/app/admin/platform/categories/store/categories-slice"
import { countriesReducer } from "@/app/admin/platform/countries/store/countries-slice"
import { featureFlagsReducer } from "@/app/admin/platform/feature-flags/store/feature-flags-slice"
import { blogReducer } from "@/app/admin/marketing/blog/store/blog-slice"
import { allExtractionsReducer } from "@/app/admin/data/all-extractions/store/all-extractions-slice"
import { agentcisImportReducer } from "@/app/admin/data/agentcis-import/store/agentcis-import-slice"
import { aiMemoryReducer } from "@/app/admin/data/ai-memory/store/ai-memory-slice"
import { visasReducer } from "@/app/admin/data/visas/store/visas-slice"
import { maraAgentsReducer } from "@/app/admin/data/mara-agents/store/mara-agents-slice"
import { logsReducer } from "@/app/admin/monitoring/monitoring-logs/store/logs-slice"
import { adminOtherServicesReducer } from "@/app/admin/monitoring/other-services/store/admin-other-services-slice"
import { enquiriesReducer } from "@/app/admin/monitoring/enquiries/store/enquiries-slice"
import { adminEventsReducer } from "@/app/admin/monitoring/events/store/admin-events-slice"
import { scholarshipsReducer } from "@/app/admin/monitoring/scholarships/store/scholarships-slice"
import { notificationsReducer } from "@/app/personal/notifications/store/notifications-slice"
import { aiChatReducer } from "@/app/personal/ai/store/ai-chat-slice"
import { aiKnowledgeReducer } from "@/app/admin/data/ai-knowledge/store/ai-knowledge-slice"
import { messagesReducer } from "@/app/personal/messages/store/messages-slice"

const appReducer = combineReducers({
    signup: signupReducer,
    auth: authReducer,
    profile: profileReducer,
    home: homeReducer,
    myServices: myServicesReducer,
    businessOnboarding: businessOnboardingReducer,
    businessProfileDetail: businessProfileDetailReducer,
    businessEvents: businessEventsReducer,
    admin: adminReducer,
    overview: overviewReducer,
    adminUsers: usersReducer,
    platformBusinesses: businessesReducer,
    platformCategories: categoriesReducer,
    platformCountries: countriesReducer,
    platformFeatureFlags: featureFlagsReducer,
    marketingBlog: blogReducer,
    dataAllExtractions: allExtractionsReducer,
    dataAgentcisImport: agentcisImportReducer,
    dataAiMemory: aiMemoryReducer,
    dataVisas: visasReducer,
    dataMaraAgents: maraAgentsReducer,
    monitoringLogs: logsReducer,
    monitoringOtherServices: adminOtherServicesReducer,
    monitoringEnquiries: enquiriesReducer,
    monitoringEvents: adminEventsReducer,
    monitoringScholarships: scholarshipsReducer,
    notifications: notificationsReducer,
    aiChat: aiChatReducer,
    dataAiKnowledge: aiKnowledgeReducer,
    messages: messagesReducer,
})

// Wipe every slice back to its initial state whenever the signed-in identity
// changes (sign out, or a fresh OTP verification) — otherwise a previous
// account's data (profile, admin lists, etc.) lingers in the client-side
// Redux store and leaks into the newly signed-in user's screens until a full
// page reload happens to blow the store away.
const IDENTITY_RESET_ACTIONS = new Set([
    "auth/logout",
    "auth/verifySignInOtp/fulfilled",
    "signup/verifySignUpOtp/fulfilled",
])

const rootReducer: typeof appReducer = (state, action) => {
    return appReducer(IDENTITY_RESET_ACTIONS.has(action.type) ? undefined : state, action)
}

export const makeStore = () => {
    return configureStore({
        reducer: rootReducer,
    })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
