import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { apiCall } from "@/lib/_core/api";

type Step = "email" | "code";

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const sendCode = async () => {
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await apiCall<{ success: boolean }>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email: normalized }),
      });
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    const normalized = email.trim().toLowerCase();
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await apiCall<{ user: unknown }>("/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ email: normalized, code: code.trim() }),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="px-6 justify-center">
      <View className="gap-3">
        <Text
          className="text-3xl font-semibold text-foreground"
          style={{ fontFamily: "SourceSerif4_600SemiBold" }}
        >
          Sign in to Berkeley Tours
        </Text>
        <Text className="text-base text-muted-foreground">
          {step === "email"
            ? "We'll email you a 6-digit sign-in code. No password needed."
            : `Enter the 6-digit code sent to ${email.trim().toLowerCase()}.`}
        </Text>

        {step === "email" ? (
          <>
            <TextInput
              className="h-12 rounded-lg border border-border bg-card px-4 text-base text-foreground"
              placeholder="you@example.com"
              placeholderTextColor="#8a8a8e"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              accessibilityLabel="Email address"
            />
            <TouchableOpacity
              className="h-12 rounded-lg bg-primary items-center justify-center"
              onPress={sendCode}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Send code"
            >
              <Text className="text-base font-semibold text-primary-foreground">
                {busy ? "Sending…" : "Send code"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              className="h-12 rounded-lg border border-border bg-card px-4 text-center text-xl tracking-[8px] text-foreground"
              placeholder="000000"
              placeholderTextColor="#8a8a8e"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry={Platform.OS === "web" ? false : false}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
              accessibilityLabel="6-digit verification code"
            />
            <TouchableOpacity
              className="h-12 rounded-lg bg-primary items-center justify-center"
              onPress={verifyCode}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Verify code"
            >
              <Text className="text-base font-semibold text-primary-foreground">
                {busy ? "Verifying…" : "Verify"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Use a different email"
            >
              <Text className="text-sm text-primary underline">Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        {error ? (
          <Text className="text-sm text-red-500" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
