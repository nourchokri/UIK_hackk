"""
Data models for Quiz System
"""
from pydantic import BaseModel
from typing import List, Optional, Dict
from uuid import UUID, uuid4
from datetime import datetime

class QuizOption(BaseModel):
    """Single option in a multiple-choice question"""
    id: str  # A, B, C, or D
    text: str

class Question(BaseModel):
    """Single quiz question"""
    question_id: str
    question_text: str
    options: List[QuizOption]
    topic: str
    # Note: correct_answer and explanation are NOT included in response to user

class QuizResponse(BaseModel):
    """Response when generating a new quiz"""
    quiz_id: str
    user_id: str
    questions: List[Question]
    current_level: int
    current_xp: int
    estimated_time_minutes: int = 2

class AnswerSubmission(BaseModel):
    """User's answer submission"""
    quiz_id: str
    question_id: str
    selected_answer: str  # A, B, C, or D

class QuizFeedback(BaseModel):
    """Immediate feedback after answering a question"""
    is_correct: bool
    correct_answer: str
    explanation: str
    why_wrong: Optional[str] = None
    learning_tip: str
    xp_earned: int

class QuizCompletion(BaseModel):
    """Final quiz results"""
    quiz_id: str
    total_questions: int
    correct_answers: int
    score_percentage: int
    total_xp_earned: int
    new_level: int
    new_xp: int
    level_up: bool
    current_streak: int

class QuizHistoryItem(BaseModel):
    """Single quiz in history"""
    quiz_date: datetime
    topic: str
    score: int
    xp_earned: int
    questions_count: int

class QuizHistory(BaseModel):
    """User's quiz history"""
    user_id: str
    total_quizzes: int
    average_score: float
    total_xp: int
    current_level: int
    current_streak: int
    quizzes: List[QuizHistoryItem]

class UserProgress(BaseModel):
    """User's learning progress"""
    user_id: str
    xp: int
    level: int
    quizzes_completed: int
    current_streak: int
    last_quiz_date: Optional[datetime]
    last_lesson_topic: Optional[str]
