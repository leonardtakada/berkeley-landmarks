import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { Bar, Rule } from "@/components/print";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { signedIn } from "@/hooks/use-auth";
import { apiCall } from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { RESEND_S, isValidEmail, plainly, type Step } from "@/lib/sign-in";

/**
 * Signing in, or joining: one address, one six-figure code by email. A new
 * address makes a new account; there's no password to keep.
 */
export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const checking = useRef(false);
  const normalized = email.trim().toLowerCase();

  // The count before another code may be sent.
  useEffect(() => {
    if (!wait) return;
    const id = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const sendCode = async () => {
    if (busy) return;
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
      setCode("");
      setStep("code");
      setWait(RESEND_S);
    } catch (e) {
      setError(plainly(e, "email"));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (entered = code) => {
    if (checking.current) return;
    if (!/^\d{6}$/.test(entered)) {
      setError("Enter the six-figure code from your email.");
      return;
    }
    checking.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await apiCall<{ user: Omit<Auth.User, "lastSignedIn">; sessionToken?: string }>(
        "/auth/verify-code",
        { method: "POST", body: JSON.stringify({ email: normalized, code: entered }) },
      );
      // On a phone the session is a token in the secure store; without it
      // (an older server) the cookie the server set carries it instead.
      await signedIn({ ...result.user, lastSignedIn: new Date() }, result.sessionToken);
      router.back();
    } catch (e) {
      setError(plainly(e, "code"));
    } finally {
      checking.current = false;
      setBusy(false);
    }
  };

  return (
    <ScreenContainer variant="page" edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
              ? "We'll post a six-figure code to your email. No password to remember — and new to the guide, the same code makes your account."
              : `Six figures, sent to ${normalized}. It keeps for ten minutes.`}
          </Text>

          {step === "email" ? (
            <>
              <Text style={[TYPE.label, styles.fieldLabel]}>Your email</Text>
              {/* (Keyed, so each step's field is its own and takes the focus.) */}
              <TextInput
                key="email"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={INK.faded}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                inputMode="email"
                keyboardType="email-address"
                returnKeyType="send"
                // (Keeps the keyboard up, for the code field to take.)
                submitBehavior="submit"
                maxLength={320}
                autoFocus
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                onSubmitEditing={sendCode}
                accessibilityLabel="Email address"
              />
              <Rule color={INK.charcoal} weight={1} />
              <SolidButton label={busy ? "Sending…" : "Send me the code"} onPress={sendCode} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={[TYPE.label, styles.fieldLabel]}>The code</Text>
              <TextInput
                key="code"
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={INK.faded}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                value={code}
                onChangeText={(v) => {
                  const digits = v.replace(/[^0-9]/g, "").slice(0, 6);
                  setCode(digits);
                  if (error) setError(null);
                  // Six figures in (typed, or filled from Mail): check them.
                  if (digits.length === 6 && digits !== code) verifyCode(digits);
                }}
                accessibilityLabel="6-digit verification code"
              />
              <Rule color={INK.charcoal} weight={1} />
              <SolidButton label={busy ? "Checking…" : "Sign in"} onPress={() => verifyCode()} disabled={busy} />
              <View style={styles.alts}>
                <Pressable
                  onPress={sendCode}
                  disabled={busy || wait > 0}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={wait > 0 ? `Send a new code in ${wait} seconds` : "Send a new code"}
                >
                  <Text style={[styles.altText, (busy || wait > 0) && styles.altWaiting]}>
                    {wait > 0 ? `New code in ${wait}s` : "Send a new code"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Use a different email"
                >
                  <Text style={styles.altText}>Use a different email</Text>
                </Pressable>
              </View>
            </>
          )}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
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
  // No letterSpacing: iOS reuses text fields, and the spacing would stay
  // with the field to spread out the next one's type (the Registry's Find).
  codeInput: {
    fontFamily: FONT.light,
    fontSize: 34,
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
  alts: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  altText: {
    ...TYPE.label,
  },
  altWaiting: {
    color: INK.faded,
  },
  error: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: INK.vermilion,
    marginTop: 18,
  },
});
