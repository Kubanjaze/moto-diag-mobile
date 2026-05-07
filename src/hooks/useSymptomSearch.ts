// Phase 195 Mobile Commit 2 — typeahead search hook against
// `GET /v1/kb/symptoms?q=&category=&limit=` (Pick C from plan
// v1.0.3; endpoint verified pre-dispatch — exists at
// `src/motodiag/api/routes/kb.py:248`).
//
// Surface mirrors useDTCSearch shape (Phase 130's SearchScreen
// substrate). Returns {results, isSearching, error, search} with
// debounced input handling delegated to the consumer (consumer
// owns the input field; hook is pure data-fetch).
//
// Used by the ExtractedSymptomEditModal for the linked_symptom_id
// picker. Default category filter pre-populated from the extracted
// symptom's category field with toggle to "all categories"
// available in the modal UI.

import {useCallback, useState} from 'react';

import {api} from '../api';


export interface SymptomCatalogEntry {
  id: number;
  name: string;
  description: string;
  category: string;
  related_systems: string[] | null;
}

export interface UseSymptomSearchResult {
  results: SymptomCatalogEntry[];
  isSearching: boolean;
  error: string | null;
  search: (
    q: string,
    category?: string,
  ) => Promise<void>;
  clear: () => void;
}


/** Wire-format from backend `SymptomResponse` (Phase 178 substrate). */
interface BackendSymptomRow {
  id: number;
  name: string;
  description: string;
  category: string;
  related_systems?: string[] | null;
}


export function useSymptomSearch(): UseSymptomSearchResult {
  const [results, setResults] = useState<SymptomCatalogEntry[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (q: string, category?: string): Promise<void> => {
      // Empty query short-circuits — clear results without hitting
      // the network. Prevents empty-string-with-category from
      // returning unrelated rows.
      if (q.trim().length === 0) {
        setResults([]);
        setError(null);
        return;
      }
      setIsSearching(true);
      try {
        const {data, error: apiError} = await api.GET(
          '/v1/kb/symptoms',
          {
            params: {
              query: {
                q: q.trim(),
                category: category ?? null,
                limit: 20,
              },
            },
          },
        );
        if (apiError) {
          setError(
            typeof (apiError as {detail?: unknown}).detail === 'string'
              ? (apiError as {detail: string}).detail
              : 'Symptom search failed.',
          );
          setResults([]);
          return;
        }
        const items = ((data?.items ?? []) as BackendSymptomRow[]).map(
          (r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            category: r.category,
            related_systems: r.related_systems ?? null,
          }),
        );
        setResults(items);
        setError(null);
      } catch (thrown) {
        setError(
          thrown instanceof Error
            ? thrown.message
            : 'Symptom search failed.',
        );
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {results, isSearching, error, search, clear};
}
