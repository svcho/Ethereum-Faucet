export type CaptchaVerificationResult = {
  success: boolean;
  provider: 'turnstile' | 'disabled';
};

export async function verifyCaptcha(params: {
  token: string | undefined;
  remoteIp: string;
  secretKey: string | undefined;
  verifyUrl: string;
}): Promise<CaptchaVerificationResult> {
  const { token, remoteIp, secretKey, verifyUrl } = params;

  if (!secretKey) {
    return {
      success: true,
      provider: 'disabled',
    };
  }

  if (!token) {
    return {
      success: false,
      provider: 'turnstile',
    };
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    remoteip: remoteIp,
  });

  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    return {
      success: false,
      provider: 'turnstile',
    };
  }

  const data = (await response.json()) as { success?: boolean };

  return {
    success: data.success === true,
    provider: 'turnstile',
  };
}
