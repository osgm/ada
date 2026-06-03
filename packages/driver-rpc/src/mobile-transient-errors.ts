/** Error codes that may succeed after clearing kernel session and retrying once. */
export const MOBILE_TRANSIENT_ERROR_CODES = [
  "TRANSIENT_DRIVER_ERROR",
  "NETWORK_TIMEOUT",
  "INVOKE_HTTP_FAILED",
  "IOS_LOCATOR_LOOKUP_FAILED",
  "IOS_GET_TEXT_FAILED",
  "IOS_ASSERT_VISIBLE_FAILED",
  "ANDROID_DUMP_HIERARCHY_FAILED",
  "ANDROID_LOCATOR_LOOKUP_FAILED",
  "ANDROID_CLICK_FAILED",
  "ANDROID_TYPE_FAILED",
  "ANDROID_GET_TEXT_FAILED",
  "ANDROID_ASSERT_VISIBLE_FAILED",
  "KERNEL_EXECUTION_FAILED"
] as const;

export function isTransientMobileErrorCode(errorCode?: string): boolean {
  if (!errorCode) {
    return false;
  }
  return (MOBILE_TRANSIENT_ERROR_CODES as readonly string[]).includes(errorCode);
}
