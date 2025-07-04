import express from "express";
import { AuthValidator } from "../../utils/validation/auth/authValidator";

// UserService와 AuthService는 필요할 때 지연 로딩
export class AuthController {
  /**
   * @swagger
   * /auth/login:
   *   post:
   *     summary: 사용자 로그인
   *     description: 이메일과 비밀번호를 사용하여 사용자 인증을 수행하고 세션을 생성합니다.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 description: 사용자 이메일
   *                 example: "user@example.com"
   *               password:
   *                 type: string
   *                 description: 사용자 비밀번호
   *                 example: "password123"
   *     responses:
   *       200:
   *         description: 로그인 성공
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "로그인 성공"
   *                 user:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                       description: 사용자 ID
   *                     email:
   *                       type: string
   *                       description: 사용자 이메일
   *                     username:
   *                       type: string
   *                       description: 사용자명
   *                     profileImage:
   *                       type: string
   *                       description: 프로필 이미지 URL
   *                 sessionId:
   *                   type: string
   *                   description: 세션 ID
   *       400:
   *         description: 잘못된 요청 (유효성 검증 실패)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   examples:
   *                     invalid_email:
   *                       value: "올바른 이메일 주소를 입력해주세요."
   *                     missing_password:
   *                       value: "비밀번호를 입력해주세요."
   *       401:
   *         description: 인증 실패 (잘못된 이메일 또는 비밀번호)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "이메일 또는 비밀번호가 일치하지 않습니다."
   *       500:
   *         description: 서버 에러
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "서버 에러로 로그인 실패"
   */
  login = async (req: express.Request, res: express.Response) => {
    const { email, password } = req.body;

    // 유효성 검증
    const emailValidation = AuthValidator.validateEmail(email);
    if (!emailValidation.isValid) {
      res.status(400).json({ message: emailValidation.message });
      return;
    }

    if (!password) {
      res.status(400).json({ message: "비밀번호를 입력해주세요." });
      return;
    }

    try {
      // 지연 로딩으로 서비스 import
      const { AuthService } = await import("../../services/auth/authService");
      const { UserService } = await import("../../services/auth/userService");

      const authService = new AuthService();
      const userService = new UserService();

      // 사용자 확인
      const user = await userService.findByEmail(email);
      if (!user) {
        res
          .status(401)
          .json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
        return;
      }

      // 비밀번호 확인
      const isPasswordValid = await authService.verifyPassword(
        password,
        user.passwordHash
      );
      if (!isPasswordValid) {
        res
          .status(401)
          .json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
        return;
      }

      // 마지막 로그인 시간 업데이트
      await userService.updateUser(user._id!.toString(), {
        updatedAt: new Date(),
      });

      // 세션 저장
      req.session.user = authService.createSessionData(user);

      res.status(200).json({
        message: "로그인 성공",
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          profileImage: user.profileImage,
        },
        sessionId: req.sessionID,
      });
    } catch (error) {
      console.error("로그인 에러:", error);
      res.status(500).json({ message: "서버 에러로 로그인 실패" });
    }
  };

  /**
   * @swagger
   * /auth/logout:
   *   post:
   *     summary: 로그아웃
   *     description: 현재 세션을 종료하고 쿠키를 삭제합니다.
   *     tags: [Auth]
   *     security:
   *       - sessionAuth: []
   *     responses:
   *       200:
   *         description: 로그아웃 성공
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "로그아웃 성공"
   *                 deletedSessionId:
   *                   type: string
   *                   description: 삭제된 세션 ID
   *       500:
   *         description: 서버 에러
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "로그아웃 실패"
   */
  logout = (req: express.Request, res: express.Response) => {
    const sessionId = req.sessionID;

    req.session.destroy((err) => {
      if (err) {
        console.error("로그아웃 에러:", err);
        res.status(500).json({ message: "로그아웃 실패" });
        return;
      }

      res.clearCookie("connect.sid");
      res.status(200).json({
        message: "로그아웃 성공",
        deletedSessionId: sessionId,
      });
    });
  };

  /**
   * @swagger
   * /auth/session:
   *   get:
   *     summary: 로그인 상태 확인
   *     description: 현재 세션의 로그인 상태와 사용자 정보를 확인합니다.
   *     tags: [Auth]
   *     responses:
   *       200:
   *         description: 세션 상태 조회 성공
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   description: 로그인된 상태
   *                   properties:
   *                     loggedIn:
   *                       type: boolean
   *                       example: true
   *                     user:
   *                       type: object
   *                       properties:
   *                         userId:
   *                           type: string
   *                           description: 사용자 ID
   *                         email:
   *                           type: string
   *                           description: 사용자 이메일
   *                         username:
   *                           type: string
   *                           description: 사용자명
   *                         profileImage:
   *                           type: string
   *                           description: 프로필 이미지 URL
   *                     sessionId:
   *                       type: string
   *                       description: 세션 ID
   *                 - type: object
   *                   description: 로그인되지 않은 상태
   *                   properties:
   *                     loggedIn:
   *                       type: boolean
   *                       example: false
   *                     sessionId:
   *                       type: string
   *                       description: 세션 ID
   */
  checkSession = (req: express.Request, res: express.Response) => {
    if (req.session.user) {
      res.status(200).json({
        loggedIn: true,
        user: req.session.user,
        sessionId: req.sessionID,
      });
    } else {
      res.status(200).json({
        loggedIn: false,
        sessionId: req.sessionID,
      });
    }
  };
}
