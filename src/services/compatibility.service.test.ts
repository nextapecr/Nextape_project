import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompatibilityService } from "./compatibility.service";
import * as firestore from "firebase/firestore";
import { Timestamp, QuerySnapshot, DocumentSnapshot, DocumentData } from "firebase/firestore";
import { CandidateMatch } from "@/types/job.types";

/**
 * Mock de DocumentSnapshot de Firestore
 */
interface MockDocumentSnapshot {
  id: string;
  data: () => CandidateMatch;
  exists: () => boolean;
}

/**
 * Mock de QuerySnapshot de Firestore
 */
interface MockQuerySnapshot {
  docs: MockDocumentSnapshot[];
}

// Mock Firebase Firestore
vi.mock("@/lib/firebase/client", () => ({
  db: {},
}));

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual("firebase/firestore");
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    getDocs: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
  };
});

const createMockMatch = (
  userId: string,
  jobId: string,
  recruiterId: string,
  completedAt: Date
): CandidateMatch => ({
  userId,
  recruiterId,
  jobId,
  jobTitle: "Test Job",
  candidateName: `Candidate ${userId}`,
  score: 85,
  matchPercent: 90,
  skills: { typescript: 80, react: 85 },
  completedAt: Timestamp.fromDate(completedAt),
});

const createMockSnapshot = (matches: CandidateMatch[]): MockQuerySnapshot => ({
  docs: matches.map((match) => ({
    id: `${match.userId}_${match.jobId}`,
    data: () => match,
    exists: () => true,
  })),
});

/**
 * Mock del documento de job para validación de ownership
 */
const createMockJobDoc = (jobId: string, createdBy: string): MockDocumentSnapshot => ({
  id: jobId,
  exists: () => true,
  data: () => ({
    id: jobId,
    createdBy,
    title: "Test Job",
    requiredSkills: [],
    postedAt: Timestamp.now(),
  } as unknown as CandidateMatch),
});


/** Mockea la próxima consulta (`getDocs`) con estos matches. */
const mockQueryOnce = (matches: CandidateMatch[]) =>
  vi.mocked(firestore.getDocs).mockResolvedValueOnce(
    createMockSnapshot(matches) as unknown as QuerySnapshot<DocumentData, DocumentData>
  );

/** Un mock de documento tipado como DocumentSnapshot de Firestore. */
const asDocSnapshot = (snap: Partial<MockDocumentSnapshot>) =>
  snap as unknown as DocumentSnapshot<DocumentData, DocumentData>;

/** Tres matches (user3, user2, user1) completados hace 1, 2 y 3 segundos. */
const threeMatches = (jobId: string, recruiterId: string, now: Date) =>
  [1000, 2000, 3000].map((ago, i) =>
    createMockMatch(`user${3 - i}`, jobId, recruiterId, new Date(now.getTime() - ago))
  );

/** Cursor opaco tal como lo genera el servicio (JSON en base64). */
const encodeCursor = (data: unknown) => Buffer.from(JSON.stringify(data)).toString("base64");

describe("CompatibilityService.getMatchesForJob", () => {
  const defaultRecruiterId = "recruiter1";
  const defaultJobId = "job1";

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock por defecto: job existe y pertenece al recruiter
    const mockJobDoc = createMockJobDoc(defaultJobId, defaultRecruiterId);
    vi.mocked(firestore.getDoc).mockResolvedValue(asDocSnapshot(mockJobDoc));
  });

  it("primera página: retorna matches ordenados por completedAt DESC", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";
    const now = new Date();
    
    const matches = threeMatches(jobId, recruiterId, now);

    mockQueryOnce(matches);

    const result = await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 3,
    });

    expect(result.matches).toHaveLength(3);
    expect(result.matches[0].userId).toBe("user3");
    expect(result.matches[1].userId).toBe("user2");
    expect(result.matches[2].userId).toBe("user1");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it("detecta hasMore cuando hay más de pageSize resultados", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";
    const now = new Date();
    
    // Crear 3 matches, pero pedir solo 2 (pageSize=2 → query con limit(3))
    const matches = threeMatches(jobId, recruiterId, now);

    mockQueryOnce(matches);

    const result = await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 2,
    });

    expect(result.matches).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
  });

  it("genera cursor opaco en base64 para la siguiente página", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";
    const now = new Date();
    const completedAt = new Date(now.getTime() - 2000);
    
    const matches = [
      createMockMatch("user3", jobId, recruiterId, new Date(now.getTime() - 1000)),
      createMockMatch("user2", jobId, recruiterId, completedAt),
      createMockMatch("user1", jobId, recruiterId, new Date(now.getTime() - 3000)),
    ];

    mockQueryOnce(matches);

    const result = await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 2,
    });

    expect(result.nextCursor).toBeDefined();
    
    // Decodificar cursor
    const decoded = JSON.parse(
      Buffer.from(result.nextCursor!, "base64").toString("utf-8")
    );
    
    expect(decoded).toHaveProperty("completedAt");
    expect(decoded).toHaveProperty("docId");
    expect(decoded.docId).toBe("user2_job1");
    expect(decoded.completedAt).toBe(completedAt.getTime());
  });

  it("usa startAfter con cursor válido para siguiente página", async () => {
    const recruiterId = defaultRecruiterId;
    const jobId = defaultJobId;
    const now = new Date();
    
    const cursorData = {
      completedAt: now.getTime() - 2000,
      docId: "user2_job1",
    };
    const cursor = encodeCursor(cursorData);

    // Mock del job (primer getDoc)
    const mockJobDoc = createMockJobDoc(jobId, recruiterId);
    
    // Mock del cursor doc (segundo getDoc)
    const mockCursorDoc: MockDocumentSnapshot = {
      id: "user2_job1",
      exists: () => true,
      data: () => createMockMatch("user2", jobId, recruiterId, new Date(cursorData.completedAt)),
    };

    // Setup: primer getDoc retorna job, segundo retorna cursor
    vi.mocked(firestore.getDoc)
      .mockResolvedValueOnce(asDocSnapshot(mockJobDoc))
      .mockResolvedValueOnce(asDocSnapshot(mockCursorDoc));

    const matches = [
      createMockMatch("user1", jobId, recruiterId, new Date(now.getTime() - 3000)),
    ];

    mockQueryOnce(matches);

    const result = await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 2,
      cursor,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].userId).toBe("user1");
    expect(firestore.startAfter).toHaveBeenCalled();
  });

  it("lanza error si el cursor tiene formato inválido", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";

    await expect(
      CompatibilityService.getMatchesForJob(recruiterId, jobId, {
        cursor: "invalid-base64!!!",
      })
    ).rejects.toThrow("Invalid cursor format");
  });

  it("lanza error si el cursor tiene estructura inválida", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";
    const invalidCursor = encodeCursor({ foo: "bar" });

    await expect(
      CompatibilityService.getMatchesForJob(recruiterId, jobId, {
        cursor: invalidCursor,
      })
    ).rejects.toThrow("Invalid cursor format");
  });

  it("lanza error si el documento del cursor no existe", async () => {
    const recruiterId = defaultRecruiterId;
    const jobId = defaultJobId;
    
    const cursorData = {
      completedAt: Date.now(),
      docId: "nonexistent_job1",
    };
    const cursor = encodeCursor(cursorData);

    // Mock del job (primer getDoc)
    const mockJobDoc = createMockJobDoc(jobId, recruiterId);
    
    // Mock del cursor doc inexistente (segundo getDoc)
    const mockCursorDoc: Partial<MockDocumentSnapshot> = {
      exists: () => false,
    };

    // Setup: primer getDoc retorna job, segundo retorna cursor inexistente
    vi.mocked(firestore.getDoc)
      .mockResolvedValueOnce(asDocSnapshot(mockJobDoc))
      .mockResolvedValueOnce(asDocSnapshot(mockCursorDoc));

    await expect(
      CompatibilityService.getMatchesForJob(recruiterId, jobId, {
        cursor,
      })
    ).rejects.toThrow("Cursor document not found");
  });

  it("respeta pageSize máximo de 50", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";

    vi.mocked(firestore.getDocs).mockResolvedValueOnce(
      createMockSnapshot([]) as any
    );

    await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 100, // Solicitar más de 50
    });

    // Verificar que se llamó limit con 51 (50 + 1 para hasMore)
    expect(firestore.limit).toHaveBeenCalledWith(51);
  });

  it("usa pageSize default de 20 si no se especifica", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";

    vi.mocked(firestore.getDocs).mockResolvedValueOnce(
      createMockSnapshot([]) as any
    );

    await CompatibilityService.getMatchesForJob(recruiterId, jobId);

    // Verificar que se llamó limit con 21 (20 + 1 para hasMore)
    expect(firestore.limit).toHaveBeenCalledWith(21);
  });

  it("última página: hasMore=false sin nextCursor", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";
    const now = new Date();
    
    const matches = [
      createMockMatch("user2", jobId, recruiterId, new Date(now.getTime() - 1000)),
      createMockMatch("user1", jobId, recruiterId, new Date(now.getTime() - 2000)),
    ];

    mockQueryOnce(matches);

    const result = await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 5, // Más que los resultados disponibles
    });

    expect(result.matches).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it("filtra por recruiterId y jobId (simulación de security rules)", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";

    vi.mocked(firestore.getDocs).mockResolvedValueOnce(
      createMockSnapshot([]) as any
    );

    await CompatibilityService.getMatchesForJob(recruiterId, jobId);

    // Verificar que se llamaron los where correctos
    expect(firestore.where).toHaveBeenCalledWith("recruiterId", "==", recruiterId);
    expect(firestore.where).toHaveBeenCalledWith("jobId", "==", jobId);
    expect(firestore.orderBy).toHaveBeenCalledWith("completedAt", "desc");
  });

  it("maneja empate en completedAt usando docId como desempate", async () => {
    const recruiterId = "recruiter1";
    const jobId = "job1";
    const sameTime = new Date();
    
    // Dos matches con mismo completedAt pero diferente docId
    const matches = [
      createMockMatch("userB", jobId, recruiterId, sameTime),
      createMockMatch("userA", jobId, recruiterId, sameTime),
      createMockMatch("user1", jobId, recruiterId, new Date(sameTime.getTime() - 1000)),
    ];

    mockQueryOnce(matches);

    const result = await CompatibilityService.getMatchesForJob(recruiterId, jobId, {
      pageSize: 2,
    });

    expect(result.matches).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    
    // El cursor debe incluir docId para desempate
    const decoded = JSON.parse(
      Buffer.from(result.nextCursor!, "base64").toString("utf-8")
    );
    expect(decoded.docId).toBe("userA_job1");
  });
});
