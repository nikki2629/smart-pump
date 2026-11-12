from rest_framework import generics, permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.serializers import (
    EmailVerificationSerializer,
    DetailResponseSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RegistrationSerializer,
    VerifiedTokenObtainPairSerializer,
)
from accounts.services import reset_password, send_password_reset, verify_email
from config.throttles import (
    EmailAuthThrottle,
    LoginThrottle,
    RegistrationThrottle,
)
from drf_spectacular.utils import extend_schema

class RegistrationView(generics.CreateAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegistrationThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "detail": "Registration successful.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class EmailVerificationView(GenericAPIView):
    serializer_class = EmailVerificationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailAuthThrottle]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verify_email(token=serializer.validated_data["token"])
        return Response({"detail": "Email address verified."})


class LoginView(TokenObtainPairView):
    serializer_class = VerifiedTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]


class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailAuthThrottle]


class LogoutView(GenericAPIView):
    serializer_class = LogoutSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh_token = serializer.validated_data["refresh"]
        try:
            token = RefreshToken(refresh_token)
        except TokenError:
            return Response(
                {"refresh": ["The refresh token is invalid or expired."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if str(token.get("user_id")) != str(request.user.pk):
            return Response(
                {"refresh": ["The refresh token does not belong to this user."]},
                status=status.HTTP_403_FORBIDDEN,
            )
        token.blacklist()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(GenericAPIView):
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailAuthThrottle]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        send_password_reset(email=serializer.validated_data["email"])
        return Response(
            {"detail": "If an account exists, password reset instructions were sent."}
        )


class SendTokenEmailView(GenericAPIView):
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailAuthThrottle]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from accounts.services import send_sign_in_token_email
        send_sign_in_token_email(email=serializer.validated_data["email"])
        return Response(
            {"detail": "If an account exists, a sign-in token email was sent."}
        )


class PasswordResetConfirmView(GenericAPIView):
    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailAuthThrottle]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reset_password(**serializer.validated_data)
        return Response({"detail": "Password has been reset."})


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer

    def get_object(self):
        from accounts.models import UserProfile

        UserProfile.objects.get_or_create(user=self.request.user)
        return self.request.user
