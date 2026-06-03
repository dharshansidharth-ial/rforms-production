Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      # Auth
      post   "auth/login",    to: "auth#login"
      post   "auth/register", to: "auth#register"
      delete "auth/logout",   to: "auth#logout"
      get    "auth/me",       to: "auth#me"

      # Forms
      resources :forms do
        member do
          post :publish
          post :copy
          get  :responses_summary
        end

        # Responses nested under forms
        resources :responses, only: [:index, :create, :update] do
          member do
            post :submit
          end
          collection do
            get :export
          end
        end

        # Analytics per form
        get :analytics, to: "analytics#show"
      end

      # Public form access by token (no auth required)
      scope "/public" do
        get  "forms/:public_token",                        to: "public_forms#show"
        post "forms/:public_token/responses",              to: "responses#create"
      end

      # Analytics dashboard
      get "analytics/dashboard", to: "analytics#dashboard"

      # Users
      resources :users

      # Templates
      resources :templates, only: [:index, :show] do
        member do
          post :use
        end
      end

      # Organization
      resource :organization, only: [:show, :update]

      # Admin
      namespace :admin do
        resources :audit_logs, only: [:index]
      end
    end
  end
end
