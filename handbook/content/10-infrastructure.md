# 10. Infrastructure & Deployment

## 1. Business Motivation
**Why does this exist?**  
Code on a laptop doesn't make a company money. The code must be deployed to the cloud, be reachable by Retell AI over the public internet, and have secure access to API keys (Gemini, Google Sheets, Resend) without leaking them.

## 2. Software Engineering Concept
**PaaS (Platform as a Service), Continuous Deployment (CD), and Secrets Management.**
- **PaaS:** A cloud provider (like Railway, Heroku, or Vercel) that takes your code and runs it without you having to provision bare-metal Linux servers.
- **Continuous Deployment:** Every time you push to the `main` branch on GitHub, the PaaS automatically rebuilds and deploys the new code.
- **Secrets Management:** You never hardcode API keys in Git. You inject them as Environment Variables at runtime.

## 3. Repository Implementation
- **Platform:** Railway
- **Configuration:** `package.json` (`npm start` script is what Railway executes).
- **Secrets:** `.env` (locally) and Railway Variables Dashboard (production).
- **Git Flow:** Pushing to the `main` branch on GitHub triggers a Railway build.

## 4. Line-by-Line Walkthrough: The Entrypoint

When Railway builds your app, it looks at `package.json`:

```json
  "scripts": {
    "start": "node --experimental-specifier-resolution=node src/server.js",
    "dev": "tsx watch src/server.ts",
    "build": "tsc"
  }
```

**Why was it written this way?**  
Railway automatically detects Node.js projects and runs `npm install` followed by `npm start`. However, notice that our codebase is TypeScript (`src/server.ts`). Node.js cannot run TypeScript natively. 

We actually rely on `tsx` (TypeScript Execute) for local development, and in production we could compile it with `tsc`. Wait, the `package.json` says `node ... src/server.js`. If there is no build step configured on Railway to compile TS to JS, this will fail. Currently, Railway deployments for this project likely use `tsx` directly in a custom start command, or the `tsc` build step is triggered before start.

## 5. Production Reasoning
**Why would a company build it this way?**  
Startups use Railway or Vercel for speed. There is zero DevOps overhead. You link your GitHub repo, add your API keys, and it just works. It gives you automatic SSL (HTTPS/WSS) which is strictly required by Retell AI.

## 6. Alternatives
**Alternative: Docker on AWS ECS or EKS (Kubernetes)**
- *Why we didn't use it:* Kubernetes is for massive scale (100+ microservices). For a single monolithic Node.js Express server acting as a prototype, Kubernetes would introduce weeks of DevOps configuration (Ingress, LoadBalancers, Helm charts) with zero business value.

## 7. Tradeoffs
- **Pros:** Zero-config deployment. Auto-scaling. GitHub integration.
- **Cons:** Less control over the underlying networking (e.g., configuring custom WebSocket timeout limits at the reverse-proxy layer).

## 8. Interview Explanation
*"For infrastructure, I bypassed heavy orchestrators like Kubernetes in favor of Railway. It gives me a rapid CI/CD pipeline directly from GitHub. Railway handles the SSL termination—which is critical because Retell requires WSS (Secure WebSockets). All sensitive credentials, like the Gemini API key and the Google Service Account JSON, are injected securely via Environment Variables, ensuring they are never checked into source control."*

## 9. Likely Interviewer Questions
1. **"You mentioned environment variables. How exactly do you pass the Google Sheets Service Account JSON credential to the Railway container?"**
2. **"How do you ensure zero-downtime deployments if you push a new feature while people are on the phone?"**

## 10. Model Answers
1. *"The Google credential is a massive, multi-line JSON object. I base64-encode it and store it as a single environment variable `GOOGLE_CREDENTIALS_JSON` in Railway. On boot, `googleSheets.ts` reads `process.env.GOOGLE_CREDENTIALS_JSON`, decodes it, and passes it to the Google Auth client."*
2. *"Currently, Railway does a rolling deployment. However, because our `ConversationState` is in-memory, a rolling restart will terminate active WebSocket connections and drop calls. To achieve true zero-downtime deployments, we must first externalize state to Redis, and then implement a graceful shutdown hook (`process.on('SIGTERM')`) that stops accepting new calls but waits for active calls to finish before terminating the Node process."*

## 11. Common Mistakes Candidates Make
- **Checking in `.env` files.** Never ever push a `.env` file to Git.
- **Saying they built a Dockerfile when they didn't.** Railway uses Nixpacks to auto-detect Node.js. Don't lie about writing a Dockerfile if one doesn't exist in the repo.
