import { expect, test } from '@playwright/test';

import { backendPhp, choose, OWNER, signIn } from './helpers';

const setup = (allowed: boolean) =>
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $m = App\\Domain\\Tenancy\\Models\\TenantMembership::whereHas('user', fn ($q) => $q->where('email', '${OWNER.email}'))->with('tenant')->firstOrFail(); $t = $m->tenant; app(App\\Domain\\Tenancy\\TenantContext::class)->run($t, function () use ($t, $allowed) { App\\Domain\\Conversions\\ConversionsAccess::set($t, ${allowed ? 'true' : 'false'}); if (! ${allowed ? 'true' : 'false'}) { return; } $w = App\\Domain\\WhatsApp\\Models\\WabaAccount::query()->where('status', 'connected')->firstOrFail(); $w->forceFill(['events_permission' => true, 'events_permission_checked_at' => now()])->save(); App\\Domain\\Conversions\\Models\\MetaDataset::query()->updateOrCreate(['waba_id' => $w->waba_id], ['waba_account_id' => $w->id, 'dataset_id' => '1503923451234567', 'enabled' => true]); $c = App\\Domain\\Messaging\\Models\\Conversation::query()->with('contact')->orderBy('created_at')->firstOrFail(); if (! Illuminate\\Support\\Facades\\DB::table('ad_clicks')->where('conversation_id', $c->id)->exists()) { Illuminate\\Support\\Facades\\DB::table('ad_clicks')->insert(['id' => (string) Illuminate\\Support\\Str::uuid7(), 'tenant_id' => $t->id, 'conversation_id' => $c->id, 'contact_id' => $c->contact_id, 'waba_id' => $w->waba_id, 'ctwa_clid' => 'E2E-CLICK-ID', 'source_id' => '120210000000000001', 'source_type' => 'ad', 'headline' => 'E2E free trial ad', 'clicked_at' => now()->subHour(), 'created_at' => now()]); Illuminate\\Support\\Facades\\DB::table('conversion_events')->insert(['id' => (string) Illuminate\\Support\\Str::uuid7(), 'tenant_id' => $t->id, 'conversation_id' => $c->id, 'contact_id' => $c->contact_id, 'waba_id' => $w->waba_id, 'event_name' => 'Purchase', 'event_time' => now()->subHours(2), 'value' => 250, 'currency' => 'AED', 'status' => 'skipped', 'error_reason' => 'Conversion reporting is off for this WhatsApp account.', 'created_at' => now(), 'updated_at' => now()]); } }); });`,
    );

test('meta conversion reporting: on per account, rules, a test event and the log; hidden without the flag', async ({ page }) => {
    setup(true);
    await signIn(page);
    await page.goto('/integrations');

    const card = page.getByTestId('meta-conversions');
    await expect(card.getByText('Meta conversion reporting')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Check in Events Manager' })).toHaveAttribute('href', /events_manager/);
    await expect(card.getByText('Reporting on')).toBeVisible();
    await expect(card.getByText('Dataset 1503923451234567')).toBeVisible();

    // Purchases on, then saved.
    await card.getByRole('switch', { name: 'Report purchases' }).click();
    await card.getByRole('button', { name: 'Save rules' }).click();
    await expect(page.getByText('Conversion rules saved.')).toBeVisible();

    // Send test event for the ad-started chat: Meta's answer shows straight away, and the log has it.
    await choose(page, 'Chat for the test event', /E2E free trial ad/);
    await card.getByRole('button', { name: 'Send test event' }).click();
    const result = card.getByRole('status');
    await expect(result).toContainText('Sent');
    await expect(result).toContainText('Events Manager');
    const log = card.getByRole('region', { name: 'Events log' });
    await expect(log.getByRole('row').filter({ hasText: '(test)' })).toContainText('Sent');

    // Filter: Skipped shows the reason in plain words.
    await choose(page, 'Filter by status', 'Skipped');
    await expect(log.getByRole('row').filter({ hasText: 'Purchase' })).toContainText('Conversion reporting is off for this WhatsApp account.');
    await expect(log.getByRole('row').filter({ hasText: '(test)' })).toHaveCount(0);

    // A workspace without the flag sees no card at all.
    setup(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Stores' })).toBeVisible();
    await expect(page.getByTestId('meta-conversions')).toHaveCount(0);
});

const permission = (value: 'true' | 'false') =>
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn () => App\\Domain\\WhatsApp\\Models\\WabaAccount::query()->where('status', 'connected')->update(['events_permission' => ${value}, 'events_permission_checked_at' => now()]));`,
    );

test('channels: conversion reporting status per account, Reconnect to enable; nothing without the flag', async ({ page }) => {
    setup(true);
    permission('false');
    await signIn(page);
    await page.goto('/channels');

    const row = page.getByTestId('conversion-reporting').first();
    await expect(row).toContainText('Conversion reporting:');
    await expect(row).toContainText('Not enabled');
    await row.getByRole('button', { name: 'Reconnect to enable' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Reconnect to enable conversion reporting' })).toBeVisible();
    await expect(dialog.getByRole('radiogroup', { name: 'Number type' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    permission('true');
    await page.reload();
    await expect(page.getByTestId('conversion-reporting').first()).toContainText('Enabled');
    await expect(page.getByRole('button', { name: 'Reconnect to enable' })).toHaveCount(0);

    setup(false);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Account actions' }).first()).toBeVisible();
    await expect(page.getByTestId('conversion-reporting')).toHaveCount(0);
});
