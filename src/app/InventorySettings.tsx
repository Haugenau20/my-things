import { useMutationState } from './mutation-activity';
import { useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Inventory } from '../domain/inventory';
import { CURRENCIES } from '../domain/organize';
import { updateSettings } from '../data/inventory-repository';

export function InventorySettings({
  inventory,
  services,
  inventoryId,
  reload,
}: {
  inventory: Inventory;
  services: FirebaseServices;
  inventoryId: string;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(inventory.displayName);
  const [currency, setCurrency] = useState(inventory.defaultCurrency ?? '');
  const [base, setBase] = useState(inventory);
  const [busy, setBusy] = useMutationState();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await updateSettings(services.db, inventoryId, base, {
        displayName: name.trim(),
        defaultCurrency: currency || null,
      });
      setBase(saved);
      await reload();
      setMessage('Settings saved; existing item values retain their own currency.');
    } catch {
      setError('Could not save settings. Check the name/currency and refresh before retrying.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy}>
      <legend>Display settings</legend>
      <label>
        Inventory name
        <input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Default value currency
        <select
          aria-label="Default value currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
        >
          <option value="">No default currency</option>
          {CURRENCIES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <p className="supporting">
        The default is only a suggestion for future value entries. Existing amounts are never
        converted or reinterpreted.
      </p>
      <button className="secondary-button" onClick={() => void save()}>
        Save settings
      </button>
      <button
        className="text-button"
        onClick={() => {
          setBase(inventory);
          setName(inventory.displayName);
          setCurrency(inventory.defaultCurrency ?? '');
          setError('');
          setMessage('Latest settings loaded');
        }}
      >
        Load latest settings
      </button>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
