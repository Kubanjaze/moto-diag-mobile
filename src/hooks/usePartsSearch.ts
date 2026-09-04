// Phase 201 — usePartsSearch.
//
// Catalog browse for the parts screen. Two modes on one endpoint:
// with free text it searches; with no free text but a known bike it
// returns that bike's fitment list, which is what makes the browse
// screen useful the moment it opens rather than a blank search box.
//
// Deliberately NOT debounced here. The screen owns when to call this
// (submit or an explicit Search press), because a mechanic on shop
// wifi with gloves on is better served by a definite action than by
// keystroke-triggered requests.

import {useCallback, useState} from 'react';

import {api} from '../api';
import type {CatalogPart} from '../types/workOrder';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

export interface PartsSearchQuery {
  q?: string;
  make?: string;
  model?: string;
  year?: number;
  category?: string;
}

export interface UsePartsSearchResult {
  results: CatalogPart[];
  isSearching: boolean;
  error: ShopAccessError | null;
  /** True once a search has run — lets the screen tell "nothing yet"
   *  apart from "nothing matched", which are different empty states. */
  hasSearched: boolean;
  search: (query: PartsSearchQuery) => Promise<void>;
}

export function usePartsSearch(shopId: number): UsePartsSearchResult {
  const [results, setResults] = useState<CatalogPart[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const search = useCallback(async (
    query: PartsSearchQuery,
  ): Promise<void> => {
    setIsSearching(true);
    try {
      const {data, error: apiError, response} = await api.GET(
        '/v1/shop/{shop_id}/parts/search',
        {
          params: {
            path: {shop_id: shopId},
            query: {
              q: query.q ?? '',
              make: query.make,
              model: query.model,
              year: query.year,
              category: query.category,
            },
          },
        },
      );
      if (apiError) {
        setError(classifyShopAccessError({
          apiError,
          response: response as unknown as {status: number} | null,
          shopId,
        }));
        setResults([]);
        return;
      }
      setResults((data ?? []) as unknown as CatalogPart[]);
      setError(null);
    } catch (thrown) {
      setError(classifyShopAccessError({thrown, response: null, shopId}));
      setResults([]);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  }, [shopId]);

  return {results, isSearching, error, hasSearched, search};
}
