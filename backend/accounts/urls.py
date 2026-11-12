from django.urls import path

from accounts.views import (
    EmailVerificationView,
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    RefreshView,
    RegistrationView,
    SendTokenEmailView,
)

urlpatterns = [
    path("accounts/register/", RegistrationView.as_view(), name="account-register"),
    path(
        "accounts/email/verify/",
        EmailVerificationView.as_view(),
        name="email-verify",
    ),
    path("accounts/login/", LoginView.as_view(), name="account-login"),
    path("accounts/token/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("accounts/logout/", LogoutView.as_view(), name="account-logout"),
    path(
        "accounts/password/reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path(
        "accounts/password/reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("accounts/send-token/", SendTokenEmailView.as_view(), name="send-token-email"),
    path("accounts/me/", ProfileView.as_view(), name="account-profile"),
]
