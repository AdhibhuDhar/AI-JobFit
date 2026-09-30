// Topic -> study link + a few concrete, named problems to attempt.
//
// The named problems are the point: the AI picks a topic, the topic resolves to
// a real study link AND 2-3 specific well-known problems. Every URL here is a
// hand-written literal, so a link can never be hallucinated by the model — the
// worst case is an off-topic but valid problem, never a 404 on a made-up slug.
//
// `label`/`url` are kept as the original two-key shape so existing consumers of
// this map keep working; `problems` is additive.

const resources = {
  arrays: {
    label: 'LeetCode — Array problems',
    url: 'https://leetcode.com/tag/array/',
    problems: [
      { title: 'Two Sum', difficulty: 'Easy', url: 'https://leetcode.com/problems/two-sum/' },
      { title: 'Best Time to Buy and Sell Stock', difficulty: 'Medium', url: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/' },
      { title: 'Subarray Sum Equals K', difficulty: 'Medium', url: 'https://leetcode.com/problems/subarray-sum-equals-k/' },
    ],
  },
  strings: {
    label: 'LeetCode — String problems',
    url: 'https://leetcode.com/tag/string/',
    problems: [
      { title: 'Valid Parentheses', difficulty: 'Easy', url: 'https://leetcode.com/problems/valid-parentheses/' },
      { title: 'Longest Substring Without Repeating Characters', difficulty: 'Medium', url: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/' },
      { title: 'Valid Anagram', difficulty: 'Easy', url: 'https://leetcode.com/problems/valid-anagram/' },
    ],
  },
  'hash-maps': {
    label: 'LeetCode — Hash Table problems',
    url: 'https://leetcode.com/tag/hash-table/',
    problems: [
      { title: 'Contains Duplicate', difficulty: 'Easy', url: 'https://leetcode.com/problems/contains-duplicate/' },
      { title: 'Group Anagrams', difficulty: 'Medium', url: 'https://leetcode.com/problems/group-anagrams/' },
      { title: 'Two Sum', difficulty: 'Easy', url: 'https://leetcode.com/problems/two-sum/' },
    ],
  },
  'binary-search': {
    label: 'LeetCode — Binary Search problems',
    url: 'https://leetcode.com/tag/binary-search/',
    problems: [
      { title: 'Binary Search', difficulty: 'Easy', url: 'https://leetcode.com/problems/binary-search/' },
      { title: 'Search in Rotated Sorted Array', difficulty: 'Medium', url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/' },
      { title: 'Find Minimum in Rotated Sorted Array', difficulty: 'Medium', url: 'https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/' },
    ],
  },
  trees: {
    label: 'LeetCode — Tree problems',
    url: 'https://leetcode.com/tag/tree/',
    problems: [
      { title: 'Maximum Depth of Binary Tree', difficulty: 'Easy', url: 'https://leetcode.com/problems/maximum-depth-of-binary-tree/' },
      { title: 'Binary Tree Level Order Traversal', difficulty: 'Medium', url: 'https://leetcode.com/problems/binary-tree-level-order-traversal/' },
      { title: 'Validate Binary Search Tree', difficulty: 'Medium', url: 'https://leetcode.com/problems/validate-binary-search-tree/' },
    ],
  },
  graphs: {
    label: 'LeetCode — Graph problems',
    url: 'https://leetcode.com/tag/graph/',
    problems: [
      { title: 'Flood Fill', difficulty: 'Easy', url: 'https://leetcode.com/problems/flood-fill/' },
      { title: 'Number of Islands', difficulty: 'Medium', url: 'https://leetcode.com/problems/number-of-islands/' },
      { title: 'Course Schedule', difficulty: 'Medium', url: 'https://leetcode.com/problems/course-schedule/' },
    ],
  },
  'dynamic-programming': {
    label: 'LeetCode — DP problems',
    url: 'https://leetcode.com/tag/dynamic-programming/',
    problems: [
      { title: 'Climbing Stairs', difficulty: 'Easy', url: 'https://leetcode.com/problems/climbing-stairs/' },
      { title: 'Coin Change', difficulty: 'Medium', url: 'https://leetcode.com/problems/coin-change/' },
      { title: 'Longest Increasing Subsequence', difficulty: 'Medium', url: 'https://leetcode.com/problems/longest-increasing-subsequence/' },
    ],
  },
  'linked-lists': {
    label: 'LeetCode — Linked List problems',
    url: 'https://leetcode.com/tag/linked-list/',
    problems: [
      { title: 'Reverse Linked List', difficulty: 'Easy', url: 'https://leetcode.com/problems/reverse-linked-list/' },
      { title: 'Merge Two Sorted Lists', difficulty: 'Easy', url: 'https://leetcode.com/problems/merge-two-sorted-lists/' },
      { title: 'Linked List Cycle', difficulty: 'Easy', url: 'https://leetcode.com/problems/linked-list-cycle/' },
    ],
  },
  greedy: {
    label: 'LeetCode — Greedy problems',
    url: 'https://leetcode.com/tag/greedy/',
    problems: [
      { title: 'Jump Game', difficulty: 'Medium', url: 'https://leetcode.com/problems/jump-game/' },
      { title: 'Gas Station', difficulty: 'Medium', url: 'https://leetcode.com/problems/gas-station/' },
    ],
  },
  'stack-queue': {
    label: 'LeetCode — Stack problems',
    url: 'https://leetcode.com/tag/stack/',
    problems: [
      { title: 'Valid Parentheses', difficulty: 'Easy', url: 'https://leetcode.com/problems/valid-parentheses/' },
      { title: 'Min Stack', difficulty: 'Medium', url: 'https://leetcode.com/problems/min-stack/' },
      { title: 'Daily Temperatures', difficulty: 'Medium', url: 'https://leetcode.com/problems/daily-temperatures/' },
    ],
  },
  sorting: {
    label: 'LeetCode — Sorting problems',
    url: 'https://leetcode.com/sort/0/',
    problems: [
      { title: 'Sort an Array', difficulty: 'Medium', url: 'https://leetcode.com/problems/sort-an-array/' },
      { title: 'Merge Intervals', difficulty: 'Medium', url: 'https://leetcode.com/problems/merge-intervals/' },
    ],
  },
  sql: {
    label: 'LeetCode — SQL study plan',
    url: 'https://leetcode.com/studyplan/top-sql-50/',
    problems: [
      { title: 'Second Highest Salary', difficulty: 'Medium', url: 'https://leetcode.com/problems/second-highest-salary/' },
      { title: 'Nth Highest Salary', difficulty: 'Hard', url: 'https://leetcode.com/problems/nth-highest-salary/' },
      { title: 'Departments With The Most Employees', difficulty: 'Medium', url: 'https://leetcode.com/problems/departments-with-the-most-employees/' },
    ],
  },
  'system-design': {
    label: 'System Design Primer (GitHub)',
    url: 'https://github.com/donnemartin/system-design-primer',
    problems: [
      { title: 'Design URL Shortener', difficulty: 'Medium', url: 'https://leetcode.com/problems/design-url-shortener/' },
      { title: 'Design Twitter', difficulty: 'Hard', url: 'https://leetcode.com/problems/design-twitter/' },
      { title: 'Rate Limiter', difficulty: 'Medium', url: 'https://leetcode.com/problems/rate-limiter/' },
    ],
  },
  'rest-apis': {
    label: 'GfG — REST API tutorial',
    url: 'https://www.geeksforgeeks.org/rest-api-introduction/',
    problems: [],
  },
  mongodb: {
    label: 'GfG — MongoDB tutorial',
    url: 'https://www.geeksforgeeks.org/mongodb-tutorial/',
    problems: [],
  },
  nodejs: {
    label: 'GfG — Node.js tutorial',
    url: 'https://www.geeksforgeeks.org/nodejs/',
    problems: [
      { title: 'Event Loop ordering puzzles', difficulty: 'Medium', url: 'https://www.geeksforgeeks.org/node-js-event-loop/' },
    ],
  },
  express: {
    label: 'Express.js official docs',
    url: 'https://expressjs.com/en/starter/installing.html',
    problems: [],
  },
  angular: {
    label: 'Angular official docs',
    url: 'https://angular.dev/tutorials',
    problems: [
      { title: 'Angular — Signals guide', difficulty: 'Medium', url: 'https://angular.dev/guide/signals' },
      { title: 'Angular — Dependency injection', difficulty: 'Medium', url: 'https://angular.dev/guide/di' },
    ],
  },
  react: {
    label: 'React official docs',
    url: 'https://react.dev/learn',
    problems: [
      { title: 'React — Thinking in React', difficulty: 'Medium', url: 'https://react.dev/learn/thinking-in-react' },
    ],
  },
  'data-structures': {
    label: 'LeetCode — Data structures',
    url: 'https://leetcode.com/explore/interview/card/0/',
    problems: [
      { title: 'Implement Queue using Stacks', difficulty: 'Medium', url: 'https://leetcode.com/problems/implement-queue-using-stacks/' },
      { title: 'Design HashMap', difficulty: 'Easy', url: 'https://leetcode.com/problems/design-hashmap/' },
    ],
  },
  git: {
    label: 'Pro Git — Branching basics',
    url: 'https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell',
    problems: [],
  },
  testing: {
    label: 'Jest official docs — Testing',
    url: 'https://jestjs.io/docs/getting-started',
    problems: [],
  },
  aws: {
    label: 'AWS Cloud Practitioner Essentials',
    url: 'https://aws.amazon.com/training/digital/aws-cloud-practitioner-essentials/',
    problems: [],
  },
  docker: {
    label: 'Docker — Get Started',
    url: 'https://docs.docker.com/get-started/',
    problems: [],
  },
  kubernetes: {
    label: 'Kubernetes Basics',
    url: 'https://kubernetes.io/docs/tutorials/kubernetes-basics/',
    problems: [],
  },
  ci: {
    label: 'GitHub Actions — Learn CI/CD',
    url: 'https://docs.github.com/en/actions/walkthrough',
    problems: [],
  },
  oop: {
    label: 'GfG — OOP concepts',
    url: 'https://www.geeksforgeeks.org/object-oriented-programming-oops-concept-in-java/',
    problems: [
      { title: 'LRU Cache', difficulty: 'Medium', url: 'https://leetcode.com/problems/lru-cache/' },
    ],
  },
  'operating-systems': {
    label: 'GfG — Operating Systems',
    url: 'https://www.geeksforgeeks.org/operating-systems/',
    problems: [
      { title: 'Semaphore / Deadlock Puzzles', difficulty: 'Medium', url: 'https://leetcode.com/problems/semaphore/' },
    ],
  },
  dbms: {
    label: 'GfG — DBMS tutorial',
    url: 'https://www.geeksforgeeks.org/dbms/',
    problems: [],
  },
  networking: {
    label: 'GfG — Computer Networks',
    url: 'https://www.geeksforgeeks.org/computer-network-tutorials/',
    problems: [],
  },
  ml: {
    label: 'Google ML Crash Course',
    url: 'https://developers.google.com/machine-learning/crash-course',
    problems: [],
  },
  behavioral: {
    label: 'GfG — Behavioral interview questions',
    url: 'https://www.geeksforgeeks.org/behavioral-interview-questions/',
    problems: [],
  },
};

// The helper exports are attached non-enumerably on purpose. A plain
// `resources.TOPICS = ...` would make "TOPICS" a key of the map itself: it
// would appear in Object.keys(resources), become a value the AI is allowed to
// return, and resolve to a resource that does not exist. defineProperty with
// enumerable:false keeps them off the topic list.
const helper = (name, value) =>
  Object.defineProperty(resources, name, { value, enumerable: false });

/** Every topic key the AI is allowed to return. */
helper('TOPICS', Object.keys(resources));

/** Resolve any string to a real topic, falling back to a generic one. */
helper('resolveTopic', (topic) => (resources[topic] ? topic : 'dbms'));

module.exports = resources;
