import { configureStore } from "@reduxjs/toolkit"
import { signupReducer } from "@/app/signup/store/signup-slice"
import { authReducer } from "@/app/auth/store/auth-slice"
import { personalOnboardingReducer } from "@/app/personal/store/personal-onboarding-slice"
import { businessOnboardingReducer } from "@/app/business/store/business-onboarding-slice"

export const makeStore = () => {
    return configureStore({
        reducer: {
            signup: signupReducer,
            auth: authReducer,
            personalOnboarding: personalOnboardingReducer,
            businessOnboarding: businessOnboardingReducer,
        }
    })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
