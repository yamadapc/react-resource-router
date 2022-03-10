import { parse as parsePath, Token } from 'path-to-regexp';
import { InvariantRoute, Match, Query, Route } from '../../types';
import execRouteMatching from './exec-route-matching';
import { default as matchRouteList } from './index';
import { matchRouteCache } from "./utils";

interface PrefixTreeNode<T> {
  value: T[] | null;
  tail: PrefixTree<T> | null;
}

interface ConcretePrefixTree<T> {
  [prefix: string]: PrefixTreeNode<T>;
}

class PrefixTree<T> {
  prefixes: ConcretePrefixTree<T> = {};

  find(path: string[]): T[] | null {
    if (path.length === 0) {
      return null;
    }

    const node = this.prefixes[path[0]];
    if (!node) {
      return null;
    }

    if (path.length > 1) {
      return node.tail?.find(path.slice(1)) ?? null;
    } else {
      return node.value;
    }
  }

  add(path: string[], value: T) {
    const prefix = path[0];
    if (!this.prefixes[prefix]) {
      this.prefixes[prefix] = { value: null, tail: null };
    }

    if (path.length > 1) {
      const tail = this.prefixes[prefix].tail ?? new PrefixTree<T>();
      tail.add(path.slice(1), value);
      this.prefixes[prefix].tail = tail;
    } else {
      const nodeValue = this.prefixes[prefix].value;
      if (nodeValue) {
        nodeValue.push(value);
      } else {
        this.prefixes[prefix].value = [value];
      }
    }
  }
}

function takeWhile<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (!predicate(arr[i])) {
      return result;
    }
    result.push(arr[i]);
  }
  return result;
}

function expandToken(token: Token): Token[] {
  if (typeof token === 'string') {
    return token.split('/').slice(1);
  }

  if (token.pattern === '[^\\/]+?') {
    return ['*'];
  }

  return [token];
}

function buildTrie(
  routes: InvariantRoute[]
): PrefixTree<InvariantRoute> | null {
  const trie = new PrefixTree<InvariantRoute>();
  routes.forEach(route => {
    // const options = {
    //   end: route.exact,
    //   sensitive: false,
    //   strict: false,
    // };
    const tokens = parsePath(route.path);
    const expandedTokens = tokens.flatMap((token: Token): Token | Token[] => {
      return expandToken(token);
    });

    // console.log(expandedTokens);

    // @ts-ignore
    const stringPrefix: string[] = takeWhile(
      expandedTokens,
      (token: Token) => typeof token === 'string'
    );

    trie.add(stringPrefix, route);
  });

  return trie;
}

// console.log(parsePath('/jira/:projectType(software|classic)'));
// process.exit(0);

const routes = require('../../../../example-routes.json');
// console.log(routes.length);
const routeTrie = buildTrie(routes);
// console.log(JSON.stringify(routeTrie?.prefixes, null, 2));

type Result = { route: InvariantRoute; match: Match };

export const matchRoute = (
  trie: PrefixTree<InvariantRoute>,
  pathname: string,
  queryParams: Query = {},
  basePath = ''
): Result | null => {
  const splitPath = pathname.split('/').filter(s => s);

  let currentPrefix = 0;
  let currentTrie: PrefixTree<InvariantRoute> | null = trie;
  let match: Result | null = null;

  const patterns = [];
  while (currentTrie && currentPrefix < splitPath.length) {
    const prefix = splitPath[currentPrefix];
    const node: PrefixTreeNode<InvariantRoute> | void =
      currentTrie.prefixes[prefix] || currentTrie.prefixes['*'];

    if (node?.value) {
      patterns.push(...node.value);
    }

    currentTrie = node?.tail ?? null;
    currentPrefix++;
  }

  for (let i = patterns.length - 1; i >= 0; i--) {
    const pattern = patterns[i];
    // console.log('Executing', pattern.path);
    match = execRouteMatching(pattern, pathname, queryParams, basePath);
    if (match) {
      return match;
    }
  }

  return null;
};

// %NeverOptimizeFunction(matchRoute);
// %NeverOptimizeFunction(matchRouteList);

function testPerformance() {
  const iterations = 10000;

  {
    const now = performance.now();
    const results = [];
    for (let i = 0; i < iterations; i++) {
      const route = matchRoute(
        // @ts-ignore
        routeTrie,
        '/jira/software/projects/APERF/boards/4654'
      );
      results.push(route);
    }
    const duration = (performance.now() - now) / results.length;
    console.log('trie', duration + 'ms', 'per iteration', results.length, 'iterations');
  }

  {
    const now = performance.now();
    const results = [];
    for (let i = 0; i < iterations; i++) {
      // @ts-ignore
      const route = matchRouteList(
        routes,
        '/jira/software/projects/APERF/boards/4654'
      );

      results.push(route);
      // console.log(route?.match.path);
    }
    const duration = (performance.now() - now) / results.length;
    console.log('list', duration + 'ms', 'per iteration', results.length, 'iterations');
  }
}

testPerformance();
testPerformance();
testPerformance();
testPerformance();
