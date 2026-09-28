import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { Bar, Rule } from "@/components/print";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
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
    <ScreenContainer variant="page" edges={["top", "left", "right", "bottom"]}>
      <View style={styles.page}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close} accessibilityLabel="Close">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>

        <View style={styles.slip}>
          <Bar />
          <Text style={[TYPE.kicker, styles.kicker]}>{step === "email" ? "The reader's register" : "Check your email"}</Text>
          <Text style={styles.title}>
            {step === "email" ? "Sign in" : "Enter the code"}
          </Text>
          <Text style={styles.note}>
            {step === "email"
              ? "We'll post a six-figure code to your email. No password to remember."
              : `Six figures, sent to ${email.trim().toLowerCase()}.`}
          </Text>

          {step === "email" ? (
            <>
              <Text style={[TYPE.label, styles.fieldLabel]}>Your email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={INK.faded}
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Email address"
              />
              <Rule color={INK.charcoal} weight={1} />
              <SolidButton label={busy ? "Sending…" : "Send me the code"} onPress={sendCode} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={[TYPE.label, styles.fieldLabel]}>The code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={INK.faded}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                accessibilityLabel="6-digit verification code"
              />
              <Rule color={INK.charcoal} weight={1} />
              <SolidButton label={busy ? "Checking…" : "Sign in"} onPress={verifyCode} disabled={busy} />
              <Pressable
                onPress={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
                hitSlop={8}
                style={styles.alt}
                accessibilityRole="button"
                accessibilityLabel="Use a different email"
              >
                <Text style={styles.altText}>Use a different email</Text>
              </Pressable>
            </>
          )}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

/** A solid block of blue ink with the action set in tracked capitals. */
function SolidButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.solid, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.solidText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: MARGIN.outer,
  },
  close: {
    position: "absolute",
    top: 8,
    right: MARGIN.outer,
  },
  closeText: {
    ...TYPE.label,
    color: INK.blue,
  },
  slip: {
    backgroundColor: PAPER.slip,
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  kicker: {
    marginTop: 12,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 34,
    lineHeight: 38,
    color: INK.charcoal,
    marginTop: 6,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: INK.sepia,
    marginTop: 10,
  },
  fieldLabel: {
    marginTop: 28,
  },
  input: {
    fontFamily: FONT.regular,
    fontSize: 18,
    color: INK.charcoal,
    paddingVertical: 10,
  },
  codeInput: {
    fontFamily: FONT.light,
    fontSize: 32,
    letterSpacing: 12,
    textAlign: "center",
  },
  solid: {
    marginTop: 28,
    backgroundColor: INK.blue,
    paddingVertical: 16,
    alignItems: "center",
  },
  solidText: {
    fontFamily: FONT.medium,
    fontSize: 12.5,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: PAPER.cover,
  },
  alt: {
    alignSelf: "center",
    marginTop: 18,
  },
  altText: {
    ...TYPE.label,
  },
  error: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: INK.vermilion,
    marginTop: 18,
  },
});
