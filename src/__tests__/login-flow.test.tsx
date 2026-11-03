/**
 * Flujo de inicio de sesión de punta a punta con un proveedor falso:
 * usuario + contraseña → 2FA → (cambio de contraseña) → inicio.
 *
 * Reproduce el fallo en el que había que escribir las credenciales dos veces: el aviso de
 * "sesión iniciada" del proveedor llega tarde (como en Supabase, que lo difiere) y la página
 * del 2FA se montaba sin sesión, devolviendo al login.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService, Session } from '../core/auth/types';

const fake = vi.hoisted(() => ({ service: null as unknown }));
vi.mock('../core/auth/index', async (orig) => ({
  ...(await orig<object>()),
  getAuthService: () => Promise.resolve(fake.service),
}));

import { AuthProvider } from '../core/auth/AuthContext';
import { RequireAuth } from '../components/Guards';
import LoginPage from '../pages/LoginPage';
import MfaPage from '../pages/MfaPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Proveedor falso: getSession es lento y el aviso de cambios llega con retraso. */
class FakeAuth {
  readonly mode = 'local' as const;
  state: Session | null = null;
  getSessionDelay = 30;
  eventDelay = 120;
  signInCalls = 0;
  role: 'admin' | 'student' = 'admin';
  rememberCalls = 0;
  trusted = false;
  private listeners = new Set<(s: Session | null) => void>();
  readonly admin = {} as AuthService['admin'];

  private notifyLater() {
    setTimeout(() => this.listeners.forEach((l) => l(this.state)), this.eventDelay);
  }
  async getSession() {
    const snapshot = this.state;
    await sleep(this.getSessionDelay);
    return snapshot;
  }
  subscribe(l: (s: Session | null) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  async signIn(username: string, password: string) {
    this.signInCalls++;
    if (username !== 'admin' || password !== 'Correct-Horse-2026') throw new Error('bad');
    const skip = this.trusted && this.role !== 'admin';
    this.state = {
      user: { id: 'u1', username: 'admin', role: this.role, mustChangePassword: false },
      aal: skip ? 'aal2' : 'aal1',
      hasMfa: true,
      trustedDevice: skip,
    };
    this.notifyLater();
    return skip ? ('done' as const) : ('mfa-verify' as const);
  }
  async startMfaEnrollment() {
    return { factorId: 'f', uri: 'otpauth://totp/x?secret=ABC', secret: 'ABC' };
  }
  async confirmMfaEnrollment() {}
  async verifyMfa(code: string) {
    if (code !== '123456') throw new Error('bad code');
    this.state = { ...this.state!, aal: 'aal2' };
    this.notifyLater();
  }
  async changeOwnPassword() {}
  async rememberDevice() {
    this.rememberCalls++;
    if (this.role !== 'admin') this.trusted = true;
  }
  async signOut() {
    this.state = null;
    this.notifyLater();
  }
}

let container: HTMLDivElement;
let root: Root;
let auth: FakeAuth;

function renderApp(initial = '/login') {
  act(() => {
    root.render(
      <AuthProvider>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/mfa" element={<MfaPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <p data-testid="home">home</p>
                </RequireAuth>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  });
}

async function settle(ms = 200) {
  await act(async () => {
    await sleep(ms);
  });
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

const onLogin = () => Boolean(container.querySelector('input[name="username"]'));
const onMfa = () => Boolean(container.querySelector('input[autocomplete="one-time-code"]'));

beforeEach(() => {
  auth = new FakeAuth();
  fake.service = auth;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('flujo de login', () => {
  it('pide las credenciales una sola vez aunque el aviso del proveedor llegue tarde', async () => {
    renderApp();
    await settle(80);
    expect(onLogin()).toBe(true);

    type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'admin');
    type(container.querySelector<HTMLInputElement>('input[name="password"]')!, 'Correct-Horse-2026');
    await submit();
    // Aún no ha llegado el evento del proveedor (120 ms): no debe volver al login
    await settle(60);
    expect(onLogin()).toBe(false);
    expect(onMfa()).toBe(true);
    // Ni después de que llegue
    await settle(250);
    expect(onMfa()).toBe(true);
    expect(auth.signInCalls).toBe(1);

    type(container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!, '123456');
    await submit();
    await settle(300);
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull();
  });

  it('una respuesta antigua (aal1) no pisa la sesión ya verificada (aal2)', async () => {
    renderApp();
    await settle(80);
    type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'admin');
    type(container.querySelector<HTMLInputElement>('input[name="password"]')!, 'Correct-Horse-2026');
    // El aviso de "sesión iniciada" llega justo mientras se verifica el código
    auth.eventDelay = 400;
    await submit();
    await settle(60);
    auth.eventDelay = 10;
    type(container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!, '123456');
    await submit();
    await settle(600);
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull();
    expect(onMfa()).toBe(false);
  });

  it('si ya validó la contraseña (p. ej. tras recargar), el login lleva directo al 2FA', async () => {
    auth.state = {
      user: { id: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      aal: 'aal1',
      hasMfa: true,
    };
    renderApp('/login');
    await settle(120);
    expect(onMfa()).toBe(true);
  });

  it('alumno: tras el 2FA recuerda el dispositivo y el siguiente login no pide el código', async () => {
    auth.role = 'student';
    renderApp();
    await settle(80);
    type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'admin');
    type(container.querySelector<HTMLInputElement>('input[name="password"]')!, 'Correct-Horse-2026');
    await submit();
    await settle(60);
    const remember = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(remember?.checked).toBe(true);
    type(container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!, '123456');
    await submit();
    await settle(300);
    expect(auth.rememberCalls).toBe(1);
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull();

    // Cierra sesión y vuelve a entrar: directo al inicio, sin pantalla de código
    await act(async () => {
      await auth.signOut();
    });
    act(() => root.unmount());
    root = createRoot(container);
    renderApp();
    await settle(200);
    expect(onLogin()).toBe(true);
    type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'admin');
    type(container.querySelector<HTMLInputElement>('input[name="password"]')!, 'Correct-Horse-2026');
    await submit();
    await settle(60);
    expect(onMfa()).toBe(false);
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull();
  });

  it('administrador: no se ofrece recordar el dispositivo', async () => {
    renderApp();
    await settle(80);
    type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'admin');
    type(container.querySelector<HTMLInputElement>('input[name="password"]')!, 'Correct-Horse-2026');
    await submit();
    await settle(60);
    expect(onMfa()).toBe(true);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    type(container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!, '123456');
    await submit();
    await settle(300);
    expect(auth.rememberCalls).toBe(0);
  });

  it('credenciales incorrectas: se queda en el login con un error', async () => {
    renderApp();
    await settle(80);
    type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'admin');
    type(container.querySelector<HTMLInputElement>('input[name="password"]')!, 'wrong-password-1A!');
    await submit();
    await settle(100);
    expect(onLogin()).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
