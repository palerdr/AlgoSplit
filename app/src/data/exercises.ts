/**
 * Comprehensive Exercise Database
 *
 * Maps real exercise names to movement patterns for the AlgoSplit analysis engine.
 * Pattern names use underscores to match backend/core/granular_patterns.py keys.
 *
 * Key patterns:
 * - humeral_adduction_compound = sternocostal (mid-lower chest) - flat/decline presses
 * - clavicular_humeral_adduction_compound = clavicular (upper chest) - incline presses
 * - humeral_adduction_isolation = sternocostal - flat flies
 * - clavicular_humeral_adduction_isolation = clavicular - incline/low-to-high flies
 */

export interface Exercise {
  name: string;
  pattern: string;
  equipment?: string;
  unilateral?: boolean;
}

export interface ExerciseCategory {
  name: string;
  exercises: Exercise[];
}

/**
 * All exercises organized by category
 * Pattern names match granular_patterns.py keys (underscore-separated)
 */
export const EXERCISE_DATABASE: ExerciseCategory[] = [
  // =========================================================================
  // CHEST
  // =========================================================================
  {
    name: 'Chest',
    exercises: [
      // FLAT PRESSING - sternocostal (mid-lower chest)
      { name: 'Barbell Bench Press', pattern: 'humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Bench Press', pattern: 'humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Flat Bench Press', pattern: 'humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Dumbbell Bench Press', pattern: 'humeral_adduction_compound', equipment: 'dumbbell' },
      { name: 'Dumbbell Press', pattern: 'humeral_adduction_compound', equipment: 'dumbbell' },
      { name: 'DB Bench Press', pattern: 'humeral_adduction_compound', equipment: 'dumbbell' },
      { name: 'Machine Chest Press', pattern: 'humeral_adduction_compound', equipment: 'machine' },
      { name: 'Chest Press Machine', pattern: 'humeral_adduction_compound', equipment: 'machine' },
      { name: 'Smith Machine Bench Press', pattern: 'humeral_adduction_compound', equipment: 'smith' },
      { name: 'Push Up', pattern: 'humeral_adduction_compound', equipment: 'bodyweight' },
      { name: 'Pushup', pattern: 'humeral_adduction_compound', equipment: 'bodyweight' },
      { name: 'Weighted Push Up', pattern: 'humeral_adduction_compound', equipment: 'bodyweight' },

      // DECLINE PRESSING - sternocostal (mid-lower chest emphasis)
      { name: 'Decline Bench Press', pattern: 'humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Decline Dumbbell Press', pattern: 'humeral_adduction_compound', equipment: 'dumbbell' },

      // INCLINE PRESSING - clavicular (upper chest)
      { name: 'Incline Bench Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Incline Barbell Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Incline Dumbbell Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'dumbbell' },
      { name: 'Incline DB Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'dumbbell' },
      { name: 'Low Incline Bench Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'barbell' },
      { name: 'Low Incline Dumbbell Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'dumbbell' },
      { name: 'Incline Machine Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'machine' },
      { name: 'Smith Machine Incline Press', pattern: 'clavicular_humeral_adduction_compound', equipment: 'smith' },
      { name: 'Incline Push Up', pattern: 'clavicular_humeral_adduction_compound', equipment: 'bodyweight' },

      // FLAT FLIES - sternocostal (mid-lower chest)
      { name: 'Cable Fly', pattern: 'humeral_adduction_isolation', equipment: 'cable' },
      { name: 'Cable Crossover', pattern: 'humeral_adduction_isolation', equipment: 'cable' },
      { name: 'High Cable Fly', pattern: 'humeral_adduction_isolation', equipment: 'cable' },
      { name: 'High to Low Cable Fly', pattern: 'humeral_adduction_isolation', equipment: 'cable' },
      { name: 'Dumbbell Fly', pattern: 'humeral_adduction_isolation', equipment: 'dumbbell' },
      { name: 'DB Fly', pattern: 'humeral_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Flat Dumbbell Fly', pattern: 'humeral_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Decline Fly', pattern: 'humeral_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Pec Deck', pattern: 'humeral_adduction_isolation', equipment: 'machine' },
      { name: 'Pec Deck Fly', pattern: 'humeral_adduction_isolation', equipment: 'machine' },
      { name: 'Machine Fly', pattern: 'humeral_adduction_isolation', equipment: 'machine' },

      // INCLINE FLIES - clavicular (upper chest)
      { name: 'Incline Dumbbell Fly', pattern: 'clavicular_humeral_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Incline Fly', pattern: 'clavicular_humeral_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Incline Cable Fly', pattern: 'clavicular_humeral_adduction_isolation', equipment: 'cable' },
      { name: 'Low Cable Fly', pattern: 'clavicular_humeral_adduction_isolation', equipment: 'cable' },
      { name: 'Low to High Cable Fly', pattern: 'clavicular_humeral_adduction_isolation', equipment: 'cable' },
    ],
  },

  // =========================================================================
  // BACK
  // =========================================================================
  {
    name: 'Back',
    exercises: [
      // Vertical pulls - wide grip (transverse plane - iliac lats)
      { name: 'Wide Grip Lat Pulldown', pattern: 'transverse_adduction_compound', equipment: 'cable' },
      { name: 'Wide Grip Pull Up', pattern: 'transverse_adduction_compound', equipment: 'bodyweight' },
      { name: 'Wide Pull Up', pattern: 'transverse_adduction_compound', equipment: 'bodyweight' },

      // Vertical pulls - neutral/close grip (sagittal plane - thoracic lats)
      { name: 'Lat Pulldown', pattern: 'sagittal_adduction_compound', equipment: 'cable' },
      { name: 'Cable Pulldown', pattern: 'sagittal_adduction_compound', equipment: 'cable' },
      { name: 'Close Grip Lat Pulldown', pattern: 'sagittal_adduction_compound', equipment: 'cable' },
      { name: 'Neutral Grip Lat Pulldown', pattern: 'sagittal_adduction_compound', equipment: 'cable' },
      { name: 'V-Bar Lat Pulldown', pattern: 'sagittal_adduction_compound', equipment: 'cable' },
      { name: 'Pull Up', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Pullup', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Chin Up', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Chinup', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Weighted Pull Up', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Weighted Chin Up', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Neutral Grip Pull Up', pattern: 'sagittal_adduction_compound', equipment: 'bodyweight' },
      { name: 'Assisted Pull Up', pattern: 'sagittal_adduction_compound', equipment: 'machine' },
      { name: 'Machine Pulldown', pattern: 'sagittal_adduction_compound', equipment: 'machine' },

      // Lat isolation (transverse plane - iliac lats)
      { name: 'Straight Arm Pulldown', pattern: 'transverse_adduction_isolation', equipment: 'cable' },
      { name: 'Straight Arm Lat Pulldown', pattern: 'transverse_adduction_isolation', equipment: 'cable' },
      { name: 'Pullover', pattern: 'transverse_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Dumbbell Pullover', pattern: 'transverse_adduction_isolation', equipment: 'dumbbell' },
      { name: 'DB Pullover', pattern: 'transverse_adduction_isolation', equipment: 'dumbbell' },
      { name: 'Cable Pullover', pattern: 'transverse_adduction_isolation', equipment: 'cable' },
      { name: 'Machine Pullover', pattern: 'transverse_adduction_isolation', equipment: 'machine' },

      // Rows (scapular retraction - traps/rhomboids)
      { name: 'Barbell Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Bent Over Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Bent Over Barbell Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Pendlay Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'T-Bar Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'T Bar Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Dumbbell Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'DB Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'One Arm Dumbbell Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Single Arm Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Cable Row', pattern: 'scapular_retraction_compound', equipment: 'cable' },
      { name: 'Seated Cable Row', pattern: 'scapular_retraction_compound', equipment: 'cable' },
      { name: 'Seated Row', pattern: 'scapular_retraction_compound', equipment: 'cable' },
      { name: 'Low Row', pattern: 'scapular_retraction_compound', equipment: 'cable' },
      { name: 'Machine Row', pattern: 'scapular_retraction_compound', equipment: 'machine' },
      { name: 'Chest Supported Row', pattern: 'scapular_retraction_compound', equipment: 'machine' },
      { name: 'Chest Supported Dumbbell Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell' },
      { name: 'Incline Dumbbell Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell' },
      { name: 'Seal Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Meadows Row', pattern: 'scapular_retraction_compound', equipment: 'barbell', unilateral: true },
      { name: 'Kroc Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Inverted Row', pattern: 'scapular_retraction_compound', equipment: 'bodyweight' },
      { name: 'Body Row', pattern: 'scapular_retraction_compound', equipment: 'bodyweight' },
      { name: 'Upright Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Barbell Upright Row', pattern: 'scapular_retraction_compound', equipment: 'barbell' },
      { name: 'Cable Upright Row', pattern: 'scapular_retraction_compound', equipment: 'cable' },
      { name: 'Dumbbell Upright Row', pattern: 'scapular_retraction_compound', equipment: 'dumbbell' },

      // Traps/upper back isolation
      { name: 'Shrug', pattern: 'scapular_retraction_isolation', equipment: 'barbell' },
      { name: 'Barbell Shrug', pattern: 'scapular_retraction_isolation', equipment: 'barbell' },
      { name: 'Dumbbell Shrug', pattern: 'scapular_retraction_isolation', equipment: 'dumbbell' },
      { name: 'DB Shrug', pattern: 'scapular_retraction_isolation', equipment: 'dumbbell' },
      { name: 'Trap Bar Shrug', pattern: 'scapular_retraction_isolation', equipment: 'trap bar' },
      { name: 'Face Pull', pattern: 'scapular_retraction_isolation', equipment: 'cable' },
      { name: 'Cable Face Pull', pattern: 'scapular_retraction_isolation', equipment: 'cable' },
      { name: 'Kelso Shrug', pattern: 'scapular_retraction_isolation', equipment: 'dumbbell' },
    ],
  },

  // =========================================================================
  // SHOULDERS
  // =========================================================================
  {
    name: 'Shoulders',
    exercises: [
      // Overhead pressing - pronated grip (barbell/standard)
      { name: 'Overhead Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'OHP', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Military Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Barbell Overhead Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Standing Overhead Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Seated Overhead Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Push Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Behind Neck Press', pattern: 'pronated_vertical_press_compound', equipment: 'barbell' },
      { name: 'Smith Machine Overhead Press', pattern: 'pronated_vertical_press_compound', equipment: 'smith' },
      { name: 'Machine Shoulder Press', pattern: 'pronated_vertical_press_compound', equipment: 'machine' },
      { name: 'Shoulder Press Machine', pattern: 'pronated_vertical_press_compound', equipment: 'machine' },
      { name: 'Dumbbell Shoulder Press', pattern: 'pronated_vertical_press_compound', equipment: 'dumbbell' },
      { name: 'DB Shoulder Press', pattern: 'pronated_vertical_press_compound', equipment: 'dumbbell' },
      { name: 'Seated Dumbbell Press', pattern: 'pronated_vertical_press_compound', equipment: 'dumbbell' },
      { name: 'Arnold Press', pattern: 'pronated_vertical_press_compound', equipment: 'dumbbell' },
      { name: 'Dumbbell Arnold Press', pattern: 'pronated_vertical_press_compound', equipment: 'dumbbell' },

      // Overhead pressing - neutral grip (more clavicular emphasis)
      { name: 'Neutral Grip Shoulder Press', pattern: 'neutral_vertical_press_compound', equipment: 'dumbbell' },
      { name: 'Hammer Shoulder Press', pattern: 'neutral_vertical_press_compound', equipment: 'dumbbell' },

      // Front delts
      { name: 'Front Raise', pattern: 'shoulder_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Dumbbell Front Raise', pattern: 'shoulder_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Cable Front Raise', pattern: 'shoulder_flexion_isolation', equipment: 'cable' },
      { name: 'Barbell Front Raise', pattern: 'shoulder_flexion_isolation', equipment: 'barbell' },
      { name: 'Plate Front Raise', pattern: 'shoulder_flexion_isolation', equipment: 'plate' },

      // Side delts
      { name: 'Lateral Raise', pattern: 'shoulder_abduction_isolation', equipment: 'dumbbell' },
      { name: 'Side Raise', pattern: 'shoulder_abduction_isolation', equipment: 'dumbbell' },
      { name: 'Dumbbell Lateral Raise', pattern: 'shoulder_abduction_isolation', equipment: 'dumbbell' },
      { name: 'DB Lateral Raise', pattern: 'shoulder_abduction_isolation', equipment: 'dumbbell' },
      { name: 'Cable Lateral Raise', pattern: 'shoulder_abduction_isolation', equipment: 'cable' },
      { name: 'Machine Lateral Raise', pattern: 'shoulder_abduction_isolation', equipment: 'machine' },

      // Rear delts
      { name: 'Rear Delt Fly', pattern: 'shoulder_transverse_abduction_isolation', equipment: 'dumbbell' },
      { name: 'Reverse Fly', pattern: 'shoulder_transverse_abduction_isolation', equipment: 'dumbbell' },
      { name: 'Bent Over Rear Delt Fly', pattern: 'shoulder_transverse_abduction_isolation', equipment: 'dumbbell' },
      { name: 'Cable Rear Delt Fly', pattern: 'shoulder_transverse_abduction_isolation', equipment: 'cable' },
      { name: 'Reverse Pec Deck', pattern: 'shoulder_transverse_abduction_isolation', equipment: 'machine' },
      { name: 'Rear Delt Machine', pattern: 'shoulder_transverse_abduction_isolation', equipment: 'machine' },
    ],
  },

  // =========================================================================
  // LEGS
  // =========================================================================
  {
    name: 'Legs',
    exercises: [
      // Squats
      { name: 'Squat', pattern: 'squat_compound', equipment: 'barbell' },
      { name: 'Back Squat', pattern: 'squat_compound', equipment: 'barbell' },
      { name: 'Barbell Squat', pattern: 'squat_compound', equipment: 'barbell' },
      { name: 'Barbell Back Squat', pattern: 'squat_compound', equipment: 'barbell' },
      { name: 'Front Squat', pattern: 'squat_compound', equipment: 'barbell' },
      { name: 'Barbell Front Squat', pattern: 'squat_compound', equipment: 'barbell' },
      { name: 'Goblet Squat', pattern: 'squat_compound', equipment: 'dumbbell' },
      { name: 'Dumbbell Squat', pattern: 'squat_compound', equipment: 'dumbbell' },
      { name: 'Smith Machine Squat', pattern: 'squat_compound', equipment: 'smith' },
      { name: 'Hack Squat', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'Hack Squat Machine', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'V Squat', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'Leg Press', pattern: 'squat_compound', equipment: 'machine' },
      { name: '45 Degree Leg Press', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'Horizontal Leg Press', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'Pendulum Squat', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'Belt Squat', pattern: 'squat_compound', equipment: 'machine' },
      { name: 'Sissy Squat', pattern: 'squat_compound', equipment: 'bodyweight' },

      // Lunges
      { name: 'Lunge', pattern: 'lunge_compound', equipment: 'bodyweight', unilateral: true },
      { name: 'Walking Lunge', pattern: 'lunge_compound', equipment: 'bodyweight', unilateral: true },
      { name: 'Dumbbell Lunge', pattern: 'lunge_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Barbell Lunge', pattern: 'lunge_compound', equipment: 'barbell', unilateral: true },
      { name: 'Reverse Lunge', pattern: 'lunge_compound', equipment: 'bodyweight', unilateral: true },
      { name: 'Split Squat', pattern: 'lunge_compound', equipment: 'bodyweight', unilateral: true },
      { name: 'Bulgarian Split Squat', pattern: 'lunge_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'BSS', pattern: 'lunge_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Rear Foot Elevated Split Squat', pattern: 'lunge_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Step Up', pattern: 'lunge_compound', equipment: 'bodyweight', unilateral: true },
      { name: 'Dumbbell Step Up', pattern: 'lunge_compound', equipment: 'dumbbell', unilateral: true },

      // Quad isolation
      { name: 'Leg Extension', pattern: 'knee_extension_isolation', equipment: 'machine' },
      { name: 'Quad Extension', pattern: 'knee_extension_isolation', equipment: 'machine' },
      { name: 'Machine Leg Extension', pattern: 'knee_extension_isolation', equipment: 'machine' },

      // Hip hinge
      { name: 'Deadlift', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'Conventional Deadlift', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'Sumo Deadlift', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'Trap Bar Deadlift', pattern: 'hinge_compound', equipment: 'trap bar' },
      { name: 'Hex Bar Deadlift', pattern: 'hinge_compound', equipment: 'trap bar' },
      { name: 'Romanian Deadlift', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'RDL', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'Dumbbell RDL', pattern: 'hinge_compound', equipment: 'dumbbell' },
      { name: 'Dumbbell Romanian Deadlift', pattern: 'hinge_compound', equipment: 'dumbbell' },
      { name: 'Single Leg RDL', pattern: 'hinge_compound', equipment: 'dumbbell', unilateral: true },
      { name: 'Stiff Leg Deadlift', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'Good Morning', pattern: 'hinge_compound', equipment: 'barbell' },
      { name: 'Barbell Good Morning', pattern: 'hinge_compound', equipment: 'barbell' },

      // Ham isolation
      { name: 'Leg Curl', pattern: 'knee_flexion_isolation', equipment: 'machine' },
      { name: 'Lying Leg Curl', pattern: 'knee_flexion_isolation', equipment: 'machine' },
      { name: 'Seated Leg Curl', pattern: 'knee_flexion_isolation', equipment: 'machine' },
      { name: 'Hamstring Curl', pattern: 'knee_flexion_isolation', equipment: 'machine' },
      { name: 'Nordic Curl', pattern: 'knee_flexion_isolation', equipment: 'bodyweight' },
      { name: 'Nordic Hamstring Curl', pattern: 'knee_flexion_isolation', equipment: 'bodyweight' },

      // Glute isolation
      { name: 'Hip Thrust', pattern: 'hip_extension_isolation', equipment: 'barbell' },
      { name: 'Barbell Hip Thrust', pattern: 'hip_extension_isolation', equipment: 'barbell' },
      { name: 'Glute Bridge', pattern: 'hip_extension_isolation', equipment: 'bodyweight' },
      { name: 'Weighted Glute Bridge', pattern: 'hip_extension_isolation', equipment: 'barbell' },
      { name: 'Cable Pull Through', pattern: 'hip_extension_isolation', equipment: 'cable' },
      { name: 'Glute Kickback', pattern: 'hip_extension_isolation', equipment: 'cable', unilateral: true },
      { name: 'Cable Glute Kickback', pattern: 'hip_extension_isolation', equipment: 'cable', unilateral: true },
      { name: 'Glute Machine', pattern: 'hip_extension_isolation', equipment: 'machine' },

      // Hip abduction
      { name: 'Hip Abduction Machine', pattern: 'hip_abduction_isolation', equipment: 'machine' },
      { name: 'Abductor Machine', pattern: 'hip_abduction_isolation', equipment: 'machine' },
      { name: 'Cable Hip Abduction', pattern: 'hip_abduction_isolation', equipment: 'cable', unilateral: true },
      { name: 'Clamshell', pattern: 'hip_abduction_isolation', equipment: 'bodyweight' },

      // Hip adduction
      { name: 'Hip Adduction Machine', pattern: 'hip_adduction_isolation', equipment: 'machine' },
      { name: 'Adductor Machine', pattern: 'hip_adduction_isolation', equipment: 'machine' },
      { name: 'Cable Hip Adduction', pattern: 'hip_adduction_isolation', equipment: 'cable', unilateral: true },
      { name: 'Copenhagen Plank', pattern: 'hip_adduction_isolation', equipment: 'bodyweight' },

      // Calves
      { name: 'Calf Raise', pattern: 'ankle_plantarflexion_isolation', equipment: 'machine' },
      { name: 'Standing Calf Raise', pattern: 'ankle_plantarflexion_isolation', equipment: 'machine' },
      { name: 'Seated Calf Raise', pattern: 'ankle_plantarflexion_isolation', equipment: 'machine' },
      { name: 'Leg Press Calf Raise', pattern: 'ankle_plantarflexion_isolation', equipment: 'machine' },
      { name: 'Donkey Calf Raise', pattern: 'ankle_plantarflexion_isolation', equipment: 'machine' },
      { name: 'Smith Machine Calf Raise', pattern: 'ankle_plantarflexion_isolation', equipment: 'smith' },
    ],
  },

  // =========================================================================
  // ARMS
  // =========================================================================
  {
    name: 'Arms',
    exercises: [
      // Biceps
      { name: 'Barbell Curl', pattern: 'elbow_flexion_isolation', equipment: 'barbell' },
      { name: 'Straight Bar Curl', pattern: 'elbow_flexion_isolation', equipment: 'barbell' },
      { name: 'EZ Bar Curl', pattern: 'elbow_flexion_isolation', equipment: 'ez bar' },
      { name: 'EZ Curl', pattern: 'elbow_flexion_isolation', equipment: 'ez bar' },
      { name: 'Dumbbell Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'DB Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Alternating Dumbbell Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Hammer Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Dumbbell Hammer Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Cross Body Hammer Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Incline Dumbbell Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Incline Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Preacher Curl', pattern: 'elbow_flexion_isolation', equipment: 'barbell' },
      { name: 'EZ Bar Preacher Curl', pattern: 'elbow_flexion_isolation', equipment: 'ez bar' },
      { name: 'Dumbbell Preacher Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Machine Preacher Curl', pattern: 'elbow_flexion_isolation', equipment: 'machine' },
      { name: 'Spider Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Concentration Curl', pattern: 'elbow_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Cable Curl', pattern: 'elbow_flexion_isolation', equipment: 'cable' },
      { name: 'Rope Hammer Curl', pattern: 'elbow_flexion_isolation', equipment: 'cable' },
      { name: 'Cable Hammer Curl', pattern: 'elbow_flexion_isolation', equipment: 'cable' },
      { name: 'Machine Curl', pattern: 'elbow_flexion_isolation', equipment: 'machine' },
      { name: 'Bicep Machine', pattern: 'elbow_flexion_isolation', equipment: 'machine' },

      // Triceps - compound (close grip pressing)
      { name: 'Close Grip Bench Press', pattern: 'tricep_compound', equipment: 'barbell' },
      { name: 'Dip', pattern: 'tricep_compound', equipment: 'bodyweight' },
      { name: 'Chest Dip', pattern: 'tricep_compound', equipment: 'bodyweight' },
      { name: 'Weighted Dip', pattern: 'tricep_compound', equipment: 'bodyweight' },

      // Triceps - standard (elbow at side/behind)
      { name: 'Tricep Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'Cable Tricep Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'Rope Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'Rope Tricep Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'V-Bar Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'Straight Bar Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'Single Arm Pushdown', pattern: 'elbow_extension_isolation', equipment: 'cable', unilateral: true },
      { name: 'French Press', pattern: 'elbow_extension_isolation', equipment: 'barbell' },
      { name: 'Skull Crusher', pattern: 'elbow_extension_isolation', equipment: 'barbell' },
      { name: 'Lying Tricep Extension', pattern: 'elbow_extension_isolation', equipment: 'barbell' },
      { name: 'EZ Bar Skull Crusher', pattern: 'elbow_extension_isolation', equipment: 'ez bar' },
      { name: 'Dumbbell Skull Crusher', pattern: 'elbow_extension_isolation', equipment: 'dumbbell' },
      { name: 'Tricep Kickback', pattern: 'elbow_extension_isolation', equipment: 'dumbbell' },
      { name: 'Dumbbell Kickback', pattern: 'elbow_extension_isolation', equipment: 'dumbbell' },
      { name: 'Cable Tricep Kickback', pattern: 'elbow_extension_isolation', equipment: 'cable' },
      { name: 'Tricep Dip', pattern: 'elbow_extension_isolation', equipment: 'bodyweight' },
      { name: 'Bench Dip', pattern: 'elbow_extension_isolation', equipment: 'bodyweight' },
      { name: 'Diamond Push Up', pattern: 'elbow_extension_isolation', equipment: 'bodyweight' },
      { name: 'Close Grip Push Up', pattern: 'tricep_compound', equipment: 'bodyweight' },
      { name: 'Tricep Machine', pattern: 'elbow_extension_isolation', equipment: 'machine' },

      // Triceps - overhead (long head emphasis)
      { name: 'Overhead Tricep Extension', pattern: 'overhead_elbow_extension_isolation', equipment: 'dumbbell' },
      { name: 'Overhead Extension', pattern: 'overhead_elbow_extension_isolation', equipment: 'dumbbell' },
      { name: 'Dumbbell Overhead Extension', pattern: 'overhead_elbow_extension_isolation', equipment: 'dumbbell' },
      { name: 'Cable Overhead Extension', pattern: 'overhead_elbow_extension_isolation', equipment: 'cable' },
      { name: 'Rope Overhead Extension', pattern: 'overhead_elbow_extension_isolation', equipment: 'cable' },

      // Forearms
      { name: 'Wrist Curl', pattern: 'wrist_flexion_isolation', equipment: 'barbell' },
      { name: 'Barbell Wrist Curl', pattern: 'wrist_flexion_isolation', equipment: 'barbell' },
      { name: 'Dumbbell Wrist Curl', pattern: 'wrist_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Reverse Wrist Curl', pattern: 'wrist_extension_isolation', equipment: 'barbell' },
      { name: 'Reverse Curl', pattern: 'wrist_extension_isolation', equipment: 'barbell' },
      { name: 'EZ Bar Reverse Curl', pattern: 'wrist_extension_isolation', equipment: 'ez bar' },
      { name: 'Farmer Walk', pattern: 'wrist_flexion_isolation', equipment: 'dumbbell' },
      { name: 'Farmer Carry', pattern: 'wrist_flexion_isolation', equipment: 'dumbbell' },
    ],
  },

  // =========================================================================
  // CORE
  // =========================================================================
  {
    name: 'Core',
    exercises: [
      // Anterior core - spinal flexion
      { name: 'Crunch', pattern: 'spinal_flexion', equipment: 'bodyweight' },
      { name: 'Ab Crunch', pattern: 'spinal_flexion', equipment: 'bodyweight' },
      { name: 'Cable Crunch', pattern: 'spinal_flexion', equipment: 'cable' },
      { name: 'Rope Crunch', pattern: 'spinal_flexion', equipment: 'cable' },
      { name: 'Machine Crunch', pattern: 'spinal_flexion', equipment: 'machine' },
      { name: 'Ab Machine', pattern: 'spinal_flexion', equipment: 'machine' },
      { name: 'Sit Up', pattern: 'spinal_flexion', equipment: 'bodyweight' },
      { name: 'Decline Crunch', pattern: 'spinal_flexion', equipment: 'bodyweight' },
      { name: 'Decline Sit Up', pattern: 'spinal_flexion', equipment: 'bodyweight' },
      { name: 'V-Up', pattern: 'spinal_flexion', equipment: 'bodyweight' },
      { name: 'Toe Touch', pattern: 'spinal_flexion', equipment: 'bodyweight' },

      // Anterior core - anti-extension
      { name: 'Ab Rollout', pattern: 'anti_extension', equipment: 'ab wheel' },
      { name: 'Ab Wheel Rollout', pattern: 'anti_extension', equipment: 'ab wheel' },
      { name: 'Plank', pattern: 'anti_extension', equipment: 'bodyweight' },
      { name: 'Front Plank', pattern: 'anti_extension', equipment: 'bodyweight' },
      { name: 'Weighted Plank', pattern: 'anti_extension', equipment: 'bodyweight' },
      { name: 'Side Plank', pattern: 'anti_extension', equipment: 'bodyweight' },
      { name: 'Dead Bug', pattern: 'anti_extension', equipment: 'bodyweight' },
      { name: 'Bird Dog', pattern: 'anti_extension', equipment: 'bodyweight' },
      { name: 'Stir the Pot', pattern: 'anti_extension', equipment: 'stability ball' },

      // Leg raises
      { name: 'Leg Raise', pattern: 'leg_raise', equipment: 'bodyweight' },
      { name: 'Lying Leg Raise', pattern: 'leg_raise', equipment: 'bodyweight' },
      { name: 'Hanging Leg Raise', pattern: 'leg_raise', equipment: 'bodyweight' },
      { name: 'Hanging Knee Raise', pattern: 'leg_raise', equipment: 'bodyweight' },
      { name: 'Captain Chair Leg Raise', pattern: 'leg_raise', equipment: 'machine' },

      // Lateral core - lateral flexion
      { name: 'Side Bend', pattern: 'lateral_flexion', equipment: 'dumbbell' },
      { name: 'Dumbbell Side Bend', pattern: 'lateral_flexion', equipment: 'dumbbell' },
      { name: 'Cable Side Bend', pattern: 'lateral_flexion', equipment: 'cable' },

      // Lateral core - rotation
      { name: 'Russian Twist', pattern: 'trunk_rotation', equipment: 'bodyweight' },
      { name: 'Bicycle Crunch', pattern: 'trunk_rotation', equipment: 'bodyweight' },
      { name: 'Oblique Crunch', pattern: 'trunk_rotation', equipment: 'bodyweight' },
      { name: 'Wood Chop', pattern: 'trunk_rotation', equipment: 'cable' },
      { name: 'Cable Wood Chop', pattern: 'trunk_rotation', equipment: 'cable' },

      // Anti-rotation
      { name: 'Pallof Press', pattern: 'anti_rotation', equipment: 'cable' },
      { name: 'Anti-Rotation Press', pattern: 'anti_rotation', equipment: 'cable' },

      // Back extension
      { name: 'Back Extension', pattern: 'spinal_extension', equipment: 'machine' },
      { name: 'Hyperextension', pattern: 'spinal_extension', equipment: 'machine' },
      { name: '45 Degree Back Extension', pattern: 'spinal_extension', equipment: 'machine' },
      { name: 'Roman Chair', pattern: 'spinal_extension', equipment: 'machine' },
      { name: 'GHD Back Extension', pattern: 'spinal_extension', equipment: 'machine' },
      { name: 'Reverse Hyper', pattern: 'spinal_extension', equipment: 'machine' },
    ],
  },
];

/**
 * Flat list of all exercises for easy searching
 */
export const ALL_EXERCISES: Exercise[] = EXERCISE_DATABASE.flatMap(
  (category) => category.exercises
);

/**
 * Get exercise names grouped by category (for UI)
 */
export function getExercisesByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const category of EXERCISE_DATABASE) {
    result[category.name] = category.exercises.map((e) => e.name);
  }
  return result;
}

/**
 * Search exercises by name
 */
export function searchExercises(query: string, limit = 10): Exercise[] {
  const lowerQuery = query.toLowerCase();
  return ALL_EXERCISES.filter((e) =>
    e.name.toLowerCase().includes(lowerQuery)
  ).slice(0, limit);
}

/**
 * Find exercise by exact name (case insensitive)
 */
export function findExercise(name: string): Exercise | undefined {
  const lowerName = name.toLowerCase();
  return ALL_EXERCISES.find((e) => e.name.toLowerCase() === lowerName);
}
