import { Link } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  ink: '#12283A',
  muted: '#627786',
  canvas: '#F3F7F9',
  surface: '#FFFFFF',
  line: '#DCE6EB',
  teal: '#087E83',
  tealDark: '#075F64',
  mint: '#E4F4F1',
  amber: '#9A6412',
  amberBg: '#FFF3D8',
  red: '#A53332',
  redBg: '#FDE9E7',
  green: '#176B4B',
  greenBg: '#E1F3E9',
};

export function AppScreen({
  children,
  scroll = true,
  contentStyle,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.screenContent, contentStyle]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, styles.fill, contentStyle]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        compact && styles.buttonCompact,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.surface : colors.teal}
        />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function FormField({
  label,
  error,
  multiline,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        placeholderTextColor="#8B9AA4"
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function StateBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'info' | 'success' | 'danger' | 'warning';
}) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>
        {label}
      </Text>
    </View>
  );
}

export function LoadingState({ label = 'Loading secure data…' }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color={colors.teal} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card style={styles.errorCard}>
      <Text style={styles.errorTitle}>We couldn’t load this information</Text>
      <Text style={styles.bodyText}>{message}</Text>
      {onRetry ? (
        <AppButton title="Try again" onPress={onRetry} variant="secondary" />
      ) : null}
    </Card>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; href?: string; onPress?: () => void };
}) {
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>+</Text>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.bodyText}>{message}</Text>
      {action ? (
        action.href ? (
          <Link href={action.href as never} style={styles.inlineLink}>
            {action.label}
          </Link>
        ) : action.onPress ? (
          <Pressable onPress={action.onPress}>
            <Text style={styles.inlineLink}>{action.label}</Text>
          </Pressable>
        ) : null
      ) : null}
    </Card>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Link href={action.href as never} style={styles.inlineLink}>
          {action.label}
        </Link>
      ) : null}
    </View>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not available';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screenContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 18,
  },
  fill: { flex: 1 },
  pageHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: {
    color: colors.teal,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 12,
  },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  bodyText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: 14 },
  button_primary: { backgroundColor: colors.teal },
  button_secondary: {
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: '#B8DEDA',
  },
  button_danger: { backgroundColor: colors.red },
  button_quiet: { backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.78 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  buttonText_primary: { color: colors.surface },
  buttonText_secondary: { color: colors.tealDark },
  buttonText_danger: { color: colors.surface },
  buttonText_quiet: { color: colors.teal },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.ink,
    fontSize: 15,
  },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  fieldError: { color: colors.red, fontSize: 12 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badge_neutral: { backgroundColor: '#E9EFF2' },
  badge_info: { backgroundColor: '#E4F0FB' },
  badge_success: { backgroundColor: colors.greenBg },
  badge_danger: { backgroundColor: colors.redBg },
  badge_warning: { backgroundColor: colors.amberBg },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeText_neutral: { color: colors.muted },
  badgeText_info: { color: '#245780' },
  badgeText_success: { color: colors.green },
  badgeText_danger: { color: colors.red },
  badgeText_warning: { color: colors.amber },
  stateBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: { color: colors.muted, fontSize: 14 },
  errorCard: { borderColor: '#F3C6C1', backgroundColor: '#FFF9F8' },
  errorTitle: { color: colors.red, fontSize: 15, fontWeight: '700' },
  emptyCard: { alignItems: 'flex-start', paddingVertical: 22 },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: { color: colors.teal, fontSize: 23, fontWeight: '500' },
  inlineLink: { color: colors.teal, fontSize: 14, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 3 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
});
