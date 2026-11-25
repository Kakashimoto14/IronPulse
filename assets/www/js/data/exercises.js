(function (root) {
  'use strict';

  const MUSCLES = {
    upper_chest: { id: 'upper_chest', name: 'Upper Chest', side: 'front', group: 'Chest' },
    mid_chest: { id: 'mid_chest', name: 'Mid Chest', side: 'front', group: 'Chest' },
    front_delts: { id: 'front_delts', name: 'Front Delts', side: 'front', group: 'Shoulders' },
    side_delts: { id: 'side_delts', name: 'Side Delts', side: 'front', group: 'Shoulders' },
    rear_delts: { id: 'rear_delts', name: 'Rear Delts', side: 'back', group: 'Shoulders' },
    traps: { id: 'traps', name: 'Traps & Neck', side: 'back', group: 'Back' },
    lats: { id: 'lats', name: 'Lats', side: 'back', group: 'Back' },
    rhomboids: { id: 'rhomboids', name: 'Mid Back', side: 'back', group: 'Back' },
    lower_back: { id: 'lower_back', name: 'Lower Back', side: 'back', group: 'Back' },
    biceps: { id: 'biceps', name: 'Biceps', side: 'front', group: 'Arms' },
    triceps: { id: 'triceps', name: 'Triceps', side: 'back', group: 'Arms' },
    brachioradialis: { id: 'brachioradialis', name: 'Brachioradialis', side: 'front', group: 'Forearms' },
    wrist_flexors: { id: 'wrist_flexors', name: 'Wrist Flexors / Cup', side: 'front', group: 'Forearms' },
    pronators: { id: 'pronators', name: 'Pronator Teres', side: 'front', group: 'Forearms' },
    abs: { id: 'abs', name: 'Rectus Abdominis', side: 'front', group: 'Core' },
    obliques: { id: 'obliques', name: 'Obliques & Rotation', side: 'front', group: 'Core' },
    glutes: { id: 'glutes', name: 'Glutes', side: 'back', group: 'Legs' },
    quads: { id: 'quads', name: 'Quads', side: 'front', group: 'Legs' },
    hamstrings: { id: 'hamstrings', name: 'Hamstrings', side: 'back', group: 'Legs' },
    calves: { id: 'calves', name: 'Calves', side: 'back', group: 'Legs' }
  };

  const DISCIPLINES = {
    strength: {
      id: 'strength',
      name: 'Strength Training',
      short: 'STRENGTH',
      tagline: 'Maximal force output, CNS neural drive & heavy compound progression.',
      repRange: [3, 6],
      isoRepRange: [6, 10],
      restCompound: 210,
      restIso: 120,
      tempo: '2-1-X-0',
      rirTarget: '1-2 RIR',
      scienceNote: 'NSCA 80-90% 1RM intensity continuum prioritizing motor-unit recruitment and 3-4 min phosphocreatine recovery.'
    },
    mass: {
      id: 'mass',
      name: 'Mass Gain',
      short: 'MASS GAIN',
      tagline: 'High mechanical tension & optimal 12-20 weekly sets for hypertrophy.',
      repRange: [6, 10],
      isoRepRange: [10, 15],
      restCompound: 150,
      restIso: 90,
      tempo: '3-1-1-0',
      rirTarget: '0-2 RIR',
      scienceNote: 'Schoenfeld hypertrophy dose-response: stretched-position ROM + double progression across 12-20 weekly hard sets.'
    },
    aesthetics: {
      id: 'aesthetics',
      name: 'Aesthetics / V-Taper',
      short: 'AESTHETICS',
      tagline: 'Broad shoulders, upper-pec shelf, wide lats, sculpted arms & tight waist.',
      repRange: [8, 12],
      isoRepRange: [12, 16],
      restCompound: 120,
      restIso: 75,
      tempo: '3-1-1-1',
      rirTarget: '1 RIR',
      scienceNote: 'Proportional volume bias emphasizing lateral deltoids, clavicular chest, lats, and controlled tempo without blocky waist load.'
    },
    armwrestling: {
      id: 'armwrestling',
      name: 'Arm Wrestling',
      short: 'ARM WRESTLING',
      tagline: 'Table-specific Cupping, Pronation, Rising, Back Pressure & Side Pressure.',
      repRange: [5, 8],
      isoRepRange: [10, 15],
      restCompound: 165,
      restIso: 90,
      tempo: '2-2-X-1',
      rirTarget: '1-2 RIR',
      scienceNote: 'Vector-specific forearm, brachioradialis, subscapularis & connective-tissue loading with blood-flow tendon recovery sets.'
    },
    calisthenics: {
      id: 'calisthenics',
      name: 'Calisthenics',
      short: 'CALISTHENICS',
      tagline: 'Relative bodyweight strength, leverage ladders & iron core control.',
      repRange: [6, 12],
      isoRepRange: [10, 18],
      restCompound: 150,
      restIso: 90,
      tempo: '3-1-1-1',
      rirTarget: '1-2 RIR',
      scienceNote: 'Leverage-based overload progressing from bilateral foundations to unilateral and weighted street-lifting skills.'
    },
    athletic: {
      id: 'athletic',
      name: 'Athletic Power',
      short: 'ATHLETIC',
      tagline: 'Explosive Rate of Force Development, sprint drive & unilateral stability.',
      repRange: [4, 6],
      isoRepRange: [8, 12],
      restCompound: 180,
      restIso: 90,
      tempo: '2-0-X-0',
      rirTarget: '2 RIR',
      scienceNote: 'Ballistic concentric intent paired with unilateral lower-body stability to maximize power-to-weight ratio.'
    },
    combat: {
      id: 'combat',
      name: 'Combat / Boxing',
      short: 'COMBAT',
      tagline: 'Rotational punch snap, high-guard shoulder endurance, neck & core armor.',
      repRange: [6, 10],
      isoRepRange: [12, 20],
      restCompound: 90,
      restIso: 60,
      tempo: '1-0-X-0',
      rirTarget: '1-2 RIR',
      scienceNote: 'Kinetic-chain hip-to-fist rotational force transfer, anaerobic round intervals, and cervical/core shock absorption.'
    },
    powerbuilding: {
      id: 'powerbuilding',
      name: 'Powerbuilding',
      short: 'POWERBUILDING',
      tagline: 'Heavy barbell strength openers followed by targeted hypertrophy work.',
      repRange: [4, 6],
      isoRepRange: [8, 12],
      restCompound: 180,
      restIso: 90,
      tempo: '2-1-1-0',
      rirTarget: '1-2 RIR',
      scienceNote: 'Conjugate-inspired blend: top heavy compound sets for neural strength + moderate-rep hypertrophy volume.'
    }
  };

  const EXERCISES = [
    // === CHEST / HORIZONTAL PUSH ===
    {
      id: 'barbell_bench',
      name: 'Barbell Bench Press',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'barbell',
      kinematics: 'bench_press',
      viewMode: 'side',
      primary: ['mid_chest', 'upper_chest'],
      secondary: ['front_delts', 'triceps'],
      stabilizers: ['lats', 'abs'],
      tempo: '3-1-1-0',
      rest: 180,
      bodyweight: false,
      jointStress: ['shoulders'],
      swapIds: ['db_incline_press', 'pushup_standard', 'weighted_dip'],
      breathing: 'Big diaphragmatic inhale at lockout, hold brace to chest touch, drive bar up and exhale past midpoint.',
      cues: [
        'Pin shoulder blades down and back into the bench to build a stable thoracic arch.',
        'Lower the bar under control to lower sternum with elbows tucked ~45 degrees.',
        'Drive feet into the floor and press slightly back toward your eye-line at lockout.'
      ],
      mistakes: [
        { bad: 'Flaring elbows 90 degrees straight out', fix: 'Tuck elbows 45 degrees to load pec fibers and shield anterior shoulder capsule.' },
        { bad: 'Bouncing bar off the ribcage', fix: 'Pause 0.5-1s softly on the chest to kill momentum and build true starting strength.' }
      ],
      ladder: { easier: 'Push-Up', current: 'Barbell Bench Press', harder: 'Paused Competition Bench' }
    },
    {
      id: 'db_incline_press',
      name: 'Incline Dumbbell Press',
      category: 'compound',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'incline_press',
      viewMode: 'side',
      primary: ['upper_chest'],
      secondary: ['front_delts', 'triceps'],
      stabilizers: ['abs', 'mid_chest'],
      tempo: '3-1-1-0',
      rest: 150,
      bodyweight: false,
      jointStress: [],
      swapIds: ['barbell_bench', 'pushup_decline', 'cable_fly'],
      breathing: 'Inhale deeply as dumbbells descend into a deep clavicular stretch; exhale smoothly through lockout.',
      cues: [
        'Set bench to a 30-degree incline (steeper shifts load too heavily onto front delts).',
        'Angle dumbbells 30 degrees inward so wrists stack directly over elbows.',
        'Stretch fully at the bottom before arcing dumbbells up without clanging them together.'
      ],
      mistakes: [
        { bad: 'Bench angle too steep (45-60 deg)', fix: 'Drop to 30 degrees to maximize clavicular upper-pec fiber alignment.' },
        { bad: 'Half-repping top half only', fix: 'Touch upper chest level with the handles for stretched-position hypertrophy.' }
      ],
      ladder: { easier: 'Incline Push-Up', current: 'Incline DB Press', harder: 'Paused 30-Deg Incline DB Press' }
    },
    {
      id: 'pushup_standard',
      name: 'Strict Chest Push-Up',
      category: 'compound',
      equipment: 'bodyweight',
      equipProp: 'none',
      kinematics: 'pushup',
      viewMode: 'side',
      primary: ['mid_chest', 'upper_chest'],
      secondary: ['triceps', 'front_delts'],
      stabilizers: ['abs', 'glutes'],
      tempo: '3-1-1-0',
      rest: 105,
      bodyweight: true,
      jointStress: [],
      swapIds: ['pushup_decline', 'pushup_diamond', 'barbell_bench'],
      breathing: 'Inhale on the 3-second descent; brace abs tight and exhale forcefully pressing the floor away.',
      cues: [
        'Screw hands into the floor slightly wider than shoulders; squeeze glutes and brace ribs down.',
        'Lower as one rigid plank until chest grazes the floor with elbows at 45 degrees.',
        'Protract shoulder blades slightly at the top for full serratus and pec contraction.'
      ],
      mistakes: [
        { bad: 'Hips sagging toward the floor', fix: 'Tuck pelvis slightly (posterior tilt) and flex quads + glutes throughout.' },
        { bad: 'Head craning down to touch early', fix: 'Keep gaze 20 cm ahead of fingertips so chest—not nose—leads to the floor.' }
      ],
      ladder: { easier: 'Incline Push-Up', current: 'Strict Push-Up', harder: 'Decline or Archer Push-Up' }
    },
    {
      id: 'pushup_decline',
      name: 'Decline Upper-Chest Push-Up',
      category: 'compound',
      equipment: 'bodyweight',
      equipProp: 'box',
      kinematics: 'pushup_decline',
      viewMode: 'side',
      primary: ['upper_chest', 'front_delts'],
      secondary: ['triceps', 'mid_chest'],
      stabilizers: ['abs'],
      tempo: '3-1-1-0',
      rest: 120,
      bodyweight: true,
      jointStress: [],
      swapIds: ['db_incline_press', 'pushup_standard', 'pushup_diamond'],
      breathing: 'Inhale slowly lowering upper chest toward hands; exhale driving smoothly to lockout.',
      cues: [
        'Elevate feet 35-50 cm on a sturdy bed, bench, or box to angle force through clavicular pecs.',
        'Maintain a straight torso line without piking your hips upward.',
        'Lower until forehead/upper chest is 2 cm above floor, pause 1s, then press.'
      ],
      mistakes: [
        { bad: 'Dropping lower back under gravity', fix: 'Lock ribcage to pelvis before every rep.' }
      ],
      ladder: { easier: 'Strict Push-Up', current: 'Decline Push-Up', harder: 'Weighted Decline / Pike Push-Up' }
    },
    {
      id: 'pushup_diamond',
      name: 'Diamond Triceps Push-Up',
      category: 'isolation',
      equipment: 'bodyweight',
      equipProp: 'none',
      kinematics: 'pushup',
      viewMode: 'side',
      primary: ['triceps', 'mid_chest'],
      secondary: ['front_delts'],
      stabilizers: ['abs'],
      tempo: '2-1-1-1',
      rest: 90,
      bodyweight: true,
      jointStress: ['elbows'],
      swapIds: ['triceps_pushdown', 'weighted_dip', 'pushup_standard'],
      breathing: 'Inhale descending sternum over thumbs; exhale locking out triceps hard.',
      cues: [
        'Place hands close beneath mid-chest forming a narrow triangle with thumbs and index fingers.',
        'Keep elbows tracking close to ribs rather than flaring wide.',
        'Squeeze triceps deliberately for 1 full second at top lockout.'
      ],
      mistakes: [
        { bad: 'Hands placed too high near face', fix: 'Shift hands down under lower chest to eliminate wrist and elbow impingement.' }
      ],
      ladder: { easier: 'Close-Grip Push-Up', current: 'Diamond Push-Up', harder: 'Weighted / Pseudo-Planche Push-Up' }
    },
    {
      id: 'weighted_dip',
      name: 'Chest & Triceps Parallel Dip',
      category: 'compound',
      equipment: 'calisthenics',
      equipProp: 'dip_bars',
      kinematics: 'dip',
      viewMode: 'side',
      primary: ['mid_chest', 'triceps'],
      secondary: ['front_delts'],
      stabilizers: ['abs', 'lats'],
      tempo: '3-1-1-0',
      rest: 150,
      bodyweight: true,
      jointStress: ['shoulders'],
      swapIds: ['barbell_bench', 'pushup_diamond', 'cable_fly'],
      breathing: 'Inhale controlled on descent to 90-degree elbow bend; exhale driving powerfully to lockout.',
      cues: [
        'Depress shoulders away from ears and lean torso 15-20 degrees forward for chest focus.',
        'Descend until biceps touch forearms or upper arms break parallel.',
        'Drive straight up without shrugging shoulders at the top.'
      ],
      mistakes: [
        { bad: 'Dropping uncontrollably into bottom stretch', fix: 'Use a strict 3-second lowering tempo to protect sternoclavicular and anterior shoulder joints.' }
      ],
      ladder: { easier: 'Bench Dip', current: 'Parallel Bar Dip', harder: 'Weighted Belt Dip' }
    },
    {
      id: 'cable_fly',
      name: 'Seated / Standing Cable Chest Fly',
      category: 'isolation',
      equipment: 'gym',
      equipProp: 'cable',
      kinematics: 'cable_fly',
      viewMode: 'front',
      primary: ['mid_chest', 'upper_chest'],
      secondary: ['front_delts'],
      stabilizers: ['abs', 'biceps'],
      tempo: '3-1-1-1',
      rest: 75,
      bodyweight: false,
      jointStress: [],
      swapIds: ['db_incline_press', 'pushup_standard'],
      breathing: 'Inhale expanding ribcage in the stretched position; exhale sweeping elbows together.',
      cues: [
        'Keep a soft 15-degree bend in elbows locked throughout the entire arc.',
        'Think about bringing your biceps together across your chest—not pushing hands forward.',
        'Hold peak contraction for 1 full second before resisting the stretch.'
      ],
      mistakes: [
        { bad: 'Turning fly into a press with heavy weight', fix: 'Drop load 20% and preserve constant elbow angle to isolate horizontal adduction.' }
      ],
      ladder: { easier: 'Band Chest Fly', current: 'Cable Chest Fly', harder: 'Paused Single-Arm Cable Fly' }
    },

    // === SHOULDERS / VERTICAL PUSH ===
    {
      id: 'barbell_ohp',
      name: 'Standing Barbell Overhead Press',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'barbell',
      kinematics: 'ohp',
      viewMode: 'front',
      primary: ['front_delts', 'side_delts'],
      secondary: ['triceps', 'upper_chest', 'traps'],
      stabilizers: ['abs', 'glutes', 'lower_back'],
      tempo: '2-1-X-0',
      rest: 180,
      bodyweight: false,
      jointStress: ['shoulders', 'lower_back'],
      swapIds: ['db_shoulder_press', 'pike_pushup', 'lateral_raise'],
      breathing: 'Inhale and brace core + glutes hard at collarbone; drive bar past forehead and exhale at lockout.',
      cues: [
        'Grip just outside shoulder width with forearms vertical and wrists stacked straight.',
        'Squeeze glutes and quads to prevent lower-back hyperextension.',
        'Press straight up, moving head slightly back then poking it through the window at lockout.'
      ],
      mistakes: [
        { bad: 'Leaning far backward into an incline press', fix: 'Brace abs down and squeeze glutes; reduce load if ribcage flares.' }
      ],
      ladder: { easier: 'Seated DB Press', current: 'Standing Barbell OHP', harder: 'Strict Z-Press / Push Press' }
    },
    {
      id: 'db_shoulder_press',
      name: 'Seated Dumbbell Shoulder Press',
      category: 'compound',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'ohp',
      viewMode: 'front',
      primary: ['front_delts', 'side_delts'],
      secondary: ['triceps', 'traps'],
      stabilizers: ['abs'],
      tempo: '3-0-1-0',
      rest: 135,
      bodyweight: false,
      jointStress: [],
      swapIds: ['barbell_ohp', 'pike_pushup', 'lateral_raise'],
      breathing: 'Inhale descending to ear level; exhale pressing smoothly overhead.',
      cues: [
        'Set bench one notch below vertical (80 deg) and press elbows in the scapular plane (30 deg forward).',
        'Control descent until dumbbells reach ear height.',
        'Press up along a smooth arc without banging weights overhead.'
      ],
      mistakes: [
        { bad: 'Elbows flared flat behind ears', fix: 'Bring elbows 30 degrees forward into the natural scapular plane.' }
      ],
      ladder: { easier: 'Half-Kneeling DB Press', current: 'Seated DB Shoulder Press', harder: 'Arnold Press / Standing OHP' }
    },
    {
      id: 'pike_pushup',
      name: 'Pike Shoulder Push-Up',
      category: 'compound',
      equipment: 'bodyweight',
      equipProp: 'none',
      kinematics: 'pike_pushup',
      viewMode: 'side',
      primary: ['front_delts', 'side_delts'],
      secondary: ['triceps', 'upper_chest'],
      stabilizers: ['abs', 'traps'],
      tempo: '3-1-1-0',
      rest: 120,
      bodyweight: true,
      jointStress: ['shoulders'],
      swapIds: ['db_shoulder_press', 'barbell_ohp', 'lateral_raise'],
      breathing: 'Inhale lowering head forward of hands; exhale pressing back into inverted V.',
      cues: [
        'Hinge hips high into an inverted V with hands shoulder-width apart.',
        'Shift crown of head forward in front of hands forming a tripod—not straight down between hands.',
        'Push back up strongly through full shoulder elevation.'
      ],
      mistakes: [
        { bad: 'Lowering head directly between hands', fix: 'Track head forward of fingertips to mimic a true vertical pressing bar path.' }
      ],
      ladder: { easier: 'Bent-Knee Pike Push-Up', current: 'Pike Push-Up', harder: 'Elevated Pike -> Wall Handstand Push-Up' }
    },
    {
      id: 'lateral_raise',
      name: 'Dumbbell Lateral Raise',
      category: 'isolation',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'lateral_raise',
      viewMode: 'front',
      primary: ['side_delts'],
      secondary: ['traps', 'front_delts'],
      stabilizers: ['abs', 'brachioradialis'],
      tempo: '2-0-1-1',
      rest: 75,
      bodyweight: false,
      jointStress: [],
      swapIds: ['face_pull', 'db_shoulder_press'],
      breathing: 'Exhale sweeping dumbbells outward to shoulder height; inhale controlling 2-second lowering.',
      cues: [
        'Lean torso 10 degrees forward and sweep arms out 20-30 degrees ahead of your midline.',
        'Lead with elbows and push dumbbells outward toward the walls—not straight up.',
        'Stop at shoulder level to keep tension on the medial deltoid rather than upper traps.'
      ],
      mistakes: [
        { bad: 'Shrugging traps and swinging lower back', fix: 'Drop weight, keep shoulders depressed, and hold 1s at shoulder height.' }
      ],
      ladder: { easier: 'Seated Lateral Raise', current: 'Standing Lateral Raise', harder: 'Behind-Back Cable Lateral Raise' }
    },
    {
      id: 'face_pull',
      name: 'Rope Face Pull & External Rotation',
      category: 'isolation',
      equipment: 'gym',
      equipProp: 'cable',
      kinematics: 'face_pull',
      viewMode: 'side',
      primary: ['rear_delts', 'rhomboids'],
      secondary: ['traps', 'side_delts'],
      stabilizers: ['abs', 'lower_back'],
      tempo: '2-1-1-1',
      rest: 75,
      bodyweight: false,
      jointStress: [],
      swapIds: ['lateral_raise', 'inverted_row'],
      breathing: 'Exhale pulling rope toward forehead and rotating thumbs back; inhale stretching forward.',
      cues: [
        'Set cable at eye height and grab rope with thumbs pointing toward your face.',
        'Pull handles apart toward your ears while externally rotating hands behind elbows (double-bicep pose).',
        'Hold peak squeeze 1 second to fortify rotator cuff and rear delts.'
      ],
      mistakes: [
        { bad: 'Pulling elbows ahead of wrists (internal rotation)', fix: 'Ensure wrists finish behind elbows at peak contraction.' }
      ],
      ladder: { easier: 'Band Pull-Apart', current: 'Cable Face Pull', harder: 'Half-Kneeling Paused Face Pull' }
    },

    // === BACK / PULL ===
    {
      id: 'pullup',
      name: 'Strict Overhand Pull-Up',
      category: 'compound',
      equipment: 'calisthenics',
      equipProp: 'pullup_bar',
      kinematics: 'pullup',
      viewMode: 'front',
      primary: ['lats', 'rhomboids'],
      secondary: ['biceps', 'brachioradialis', 'rear_delts'],
      stabilizers: ['abs', 'wrist_flexors'],
      tempo: '3-1-1-0',
      rest: 150,
      bodyweight: true,
      jointStress: ['elbows'],
      swapIds: ['chinup', 'lat_pulldown', 'inverted_row'],
      breathing: 'Inhale in active dead-hang; exhale driving elbows toward hips until chin clears bar.',
      cues: [
        'Start from a full active hang (shoulders pulled down from ears, ribs tucked).',
        'Drive elbows down and slightly inward toward your pockets—not straight back.',
        'Clear collarbone/chin over bar cleanly, then lower over a full 3-second stretch.'
      ],
      mistakes: [
        { bad: 'Kipping knees and stopping halfway down', fix: 'Keep legs straight in a hollow-body line and lower all the way to full elbow extension.' }
      ],
      ladder: { easier: 'Inverted Row / Band Pull-Up', current: 'Strict Pull-Up', harder: 'Chest-to-Bar -> Weighted Pull-Up' }
    },
    {
      id: 'chinup',
      name: 'Supinated Chin-Up (Bicep & Back-Pressure)',
      category: 'compound',
      equipment: 'calisthenics',
      equipProp: 'pullup_bar',
      kinematics: 'pullup',
      viewMode: 'front',
      primary: ['lats', 'biceps'],
      secondary: ['brachioradialis', 'wrist_flexors', 'rhomboids'],
      stabilizers: ['abs'],
      tempo: '3-1-1-1',
      rest: 150,
      bodyweight: true,
      jointStress: ['elbows'],
      swapIds: ['pullup', 'lat_pulldown', 'hammer_curl'],
      breathing: 'Inhale at bottom stretch; exhale pulling chest to bar while squeezing biceps and lats.',
      cues: [
        'Grip shoulder-width with palms facing you and thumbs wrapped tightly.',
        'Pull chest toward the bar while keeping torso steady and core braced.',
        'Pause 1 second at top (especially valuable for Arm Wrestling static lock strength).'
      ],
      mistakes: [
        { bad: 'Rounding shoulders forward at top', fix: 'Pull sternum proud to the bar and squeeze shoulder blades down.' }
      ],
      ladder: { easier: 'Eccentric Negative Chin-Up', current: 'Strict Chin-Up', harder: 'Weighted Chin-Up / 90-Deg Static Hold' }
    },
    {
      id: 'lat_pulldown',
      name: 'Wide / Neutral Lat Pulldown',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'cable',
      kinematics: 'pulldown',
      viewMode: 'front',
      primary: ['lats'],
      secondary: ['rhomboids', 'biceps', 'rear_delts'],
      stabilizers: ['abs', 'brachioradialis'],
      tempo: '3-1-1-0',
      rest: 120,
      bodyweight: false,
      jointStress: [],
      swapIds: ['pullup', 'barbell_row', 'db_row'],
      breathing: 'Inhale reaching tall into a full lat stretch; exhale driving elbows down to upper chest.',
      cues: [
        'Lock thighs snugly under the pad and lean back just 10-15 degrees.',
        'Initiate each rep by depressing shoulder blades, then pull elbows straight down toward hips.',
        'Control the stack back up until arms reach full overhead stretch.'
      ],
      mistakes: [
        { bad: 'Swinging torso flat backward like a row', fix: 'Keep torso angle fixed and let the lats initiate the pull.' }
      ],
      ladder: { easier: 'Single-Arm Pulldown', current: 'Lat Pulldown', harder: 'Strict Pull-Up' }
    },
    {
      id: 'barbell_row',
      name: 'Bent-Over Barbell Row',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'barbell',
      kinematics: 'row',
      viewMode: 'side',
      primary: ['rhomboids', 'lats'],
      secondary: ['rear_delts', 'biceps', 'lower_back', 'traps'],
      stabilizers: ['hamstrings', 'abs', 'brachioradialis'],
      tempo: '2-1-1-0',
      rest: 150,
      bodyweight: false,
      jointStress: ['lower_back'],
      swapIds: ['db_row', 'inverted_row', 'lat_pulldown'],
      breathing: 'Brace core with a deep inhale; exhale rowing bar cleanly into lower ribs/navel.',
      cues: [
        'Hinge hips back to a 45-degree torso angle with flat neutral spine.',
        'Row bar toward lower ribcage driving elbows back and squeezing mid-back hard.',
        'Resist lowering the bar smoothly without rounding lumbar spine.'
      ],
      mistakes: [
        { bad: 'Standing almost upright and shrugging', fix: 'Maintain a strict 45-degree hinge angle throughout every rep.' }
      ],
      ladder: { easier: 'Chest-Supported DB Row', current: 'Bent-Over Barbell Row', harder: 'Pendlay Explosive Row' }
    },
    {
      id: 'db_row',
      name: 'Single-Arm Dumbbell Row',
      category: 'compound',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'row',
      viewMode: 'side',
      primary: ['lats', 'rhomboids'],
      secondary: ['rear_delts', 'biceps', 'brachioradialis'],
      stabilizers: ['obliques', 'lower_back'],
      tempo: '3-1-1-0',
      rest: 105,
      bodyweight: false,
      jointStress: [],
      swapIds: ['barbell_row', 'inverted_row', 'lat_pulldown'],
      breathing: 'Inhale letting shoulder protract gently at bottom; exhale sweeping dumbbell toward hip pocket.',
      cues: [
        'Brace non-working hand firmly on a bench or rack with flat back.',
        'Sweep the dumbbell backward in a J-curve toward your hip—not straight up to your armpit.',
        'Pause 1 second squeezing the lat before a slow 3-second stretch.'
      ],
      mistakes: [
        { bad: 'Twisting torso wildly to heave weight up', fix: 'Keep shoulders square to the floor to isolate lat & rhomboid torque.' }
      ],
      ladder: { easier: 'Chest-Supported Row', current: 'Single-Arm DB Row', harder: 'Heavy Kroc Row' }
    },
    {
      id: 'inverted_row',
      name: 'Bodyweight Inverted Row',
      category: 'compound',
      equipment: 'calisthenics',
      equipProp: 'pullup_bar',
      kinematics: 'inverted_row',
      viewMode: 'side',
      primary: ['rhomboids', 'lats'],
      secondary: ['rear_delts', 'biceps', 'brachioradialis'],
      stabilizers: ['abs', 'glutes'],
      tempo: '2-1-1-1',
      rest: 105,
      bodyweight: true,
      jointStress: [],
      swapIds: ['db_row', 'pullup', 'barbell_row'],
      breathing: 'Inhale extending arms fully; exhale pulling sternum to touch the bar.',
      cues: [
        'Set bar at waist height, lock body into a rigid straight plank with heels dug in.',
        'Pull chest directly to the bar while pinching shoulder blades together.',
        'Hold 1 second at top before lowering smoothly.'
      ],
      mistakes: [
        { bad: 'Hips drooping down on reps', fix: 'Squeeze glutes and brace abs as tightly as a front plank.' }
      ],
      ladder: { easier: 'Bent-Knee Inverted Row', current: 'Straight-Body Inverted Row', harder: 'Feet-Elevated / Archer Row' }
    },

    // === LEGS / SQUAT & HINGE ===
    {
      id: 'barbell_squat',
      name: 'Barbell Back Squat',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'barbell',
      kinematics: 'squat',
      viewMode: 'side',
      primary: ['quads', 'glutes'],
      secondary: ['hamstrings', 'lower_back'],
      stabilizers: ['abs', 'calves'],
      tempo: '3-1-X-0',
      rest: 210,
      bodyweight: false,
      jointStress: ['knees', 'lower_back'],
      swapIds: ['bulgarian_split_squat', 'goblet_squat', 'bodyweight_pistol'],
      breathing: 'Take 360-degree Valsalva breath at top, hold brace through the hole, exhale past sticking point.',
      cues: [
        'Root whole foot (big toe, pinky toe, heel) into floor; bar centered over midfoot.',
        'Break hips and knees simultaneously, tracking knees cleanly over middle toes.',
        'Reach crease-of-hip below top of knee, then drive chest and hips up together.'
      ],
      mistakes: [
        { bad: 'Knees caving inward (valgus) on ascent', fix: 'Actively push knees outward and root outer foot edges.' },
        { bad: 'Heels lifting off floor', fix: 'Widen stance slightly, turn toes out 15-30 deg, or elevate heels on 2.5 kg plates.' }
      ],
      ladder: { easier: 'Goblet Squat', current: 'Barbell Back Squat', harder: 'Paused Tempo Back Squat' }
    },
    {
      id: 'romanian_deadlift',
      name: 'Romanian Deadlift (RDL)',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'barbell',
      kinematics: 'rdl',
      viewMode: 'side',
      primary: ['hamstrings', 'glutes'],
      secondary: ['lower_back', 'traps'],
      stabilizers: ['abs', 'brachioradialis'],
      tempo: '3-1-1-0',
      rest: 165,
      bodyweight: false,
      jointStress: ['lower_back'],
      swapIds: ['conventional_deadlift', 'kb_swing', 'bulgarian_split_squat'],
      breathing: 'Inhale and lock lats at top; hinge hips back under brace; exhale thrusting hips forward.',
      cues: [
        'Unlock knees 15 degrees and freeze that knee angle throughout the entire movement.',
        'Push hips straight back as if shutting a car door while shaving the bar down your thighs.',
        'Stop as soon as hips stop traveling back (mid-shin), pause 1s in peak hamstring stretch, then drive hips through.'
      ],
      mistakes: [
        { bad: 'Rounding lower back chasing the floor', fix: 'End descent at your true hamstring limit while spine stays neutral.' }
      ],
      ladder: { easier: 'Dumbbell RDL', current: 'Barbell RDL', harder: 'Deficit / Single-Leg RDL' }
    },
    {
      id: 'conventional_deadlift',
      name: 'Conventional Barbell Deadlift',
      category: 'compound',
      equipment: 'gym',
      equipProp: 'barbell',
      kinematics: 'deadlift',
      viewMode: 'side',
      primary: ['glutes', 'hamstrings', 'lower_back'],
      secondary: ['quads', 'traps', 'lats'],
      stabilizers: ['abs', 'brachioradialis', 'wrist_flexors'],
      tempo: '1-1-X-0',
      rest: 240,
      bodyweight: false,
      jointStress: ['lower_back'],
      swapIds: ['romanian_deadlift', 'kb_swing', 'barbell_squat'],
      breathing: 'Deep belly brace before pulling slack out of bar; lock lats; exhale cleanly at standing lockout.',
      cues: [
        'Stand with bar directly over shoelace knot (midfoot) and shins vertical.',
        'Pull slack out of the bar until plates click, wedge hips in, and squeeze lats like crushing oranges in armpits.',
        'Push the floor away with legs first, then drive hips smoothly into the bar at knee height.'
      ],
      mistakes: [
        { bad: 'Jerking the bar off the floor with rounded back', fix: 'Build full tension ("pull the slack") before the plates ever leave the ground.' }
      ],
      ladder: { easier: 'Trap-Bar / Elevated Deadlift', current: 'Conventional Deadlift', harder: 'Paused Below-Knee Deadlift' }
    },
    {
      id: 'bulgarian_split_squat',
      name: 'Bulgarian Split Squat',
      category: 'compound',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'split_squat',
      viewMode: 'side',
      primary: ['quads', 'glutes'],
      secondary: ['hamstrings'],
      stabilizers: ['abs', 'calves', 'obliques'],
      tempo: '3-1-1-0',
      rest: 120,
      bodyweight: false,
      jointStress: ['knees'],
      swapIds: ['goblet_squat', 'barbell_squat', 'bodyweight_pistol'],
      breathing: 'Inhale dropping back knee softly toward floor; exhale driving through front midfoot.',
      cues: [
        'Rest rear shoelaces lightly on a knee-height bench; keep 85% of weight on front leg.',
        'Lean torso 15 degrees forward over front thigh for balanced quad + glute loading.',
        'Drop smoothly until rear knee hovers 2 cm above floor, then drive straight up.'
      ],
      mistakes: [
        { bad: 'Standing on a tightrope and losing balance', fix: 'Keep feet hip-width apart laterally like railroad tracks.' }
      ],
      ladder: { easier: 'Bodyweight Split Squat', current: 'Dumbbell Bulgarian Split Squat', harder: 'Deficit / Tempo Split Squat' }
    },
    {
      id: 'goblet_squat',
      name: 'Dumbbell / Kettlebell Goblet Squat',
      category: 'compound',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'squat',
      viewMode: 'front',
      primary: ['quads', 'glutes'],
      secondary: ['abs', 'upper_chest'],
      stabilizers: ['lower_back', 'calves'],
      tempo: '3-1-1-0',
      rest: 105,
      bodyweight: false,
      jointStress: [],
      swapIds: ['barbell_squat', 'bulgarian_split_squat', 'bodyweight_pistol'],
      breathing: 'Inhale descending between knees; exhale driving upright smoothly.',
      cues: [
        'Cup the weight tight against sternum with elbows pointing straight down.',
        'Sit tall between your hips allowing elbows to lightly brush inner knees at bottom.',
        'Drive through full foot to standing without pitching chest forward.'
      ],
      mistakes: [
        { bad: 'Holding weight away from chest', fix: 'Pin weight against upper sternum to offload lower back.' }
      ],
      ladder: { easier: 'Bodyweight Tempo Squat', current: 'Goblet Squat', harder: 'Front Squat / Barbell Back Squat' }
    },
    {
      id: 'bodyweight_pistol',
      name: 'Single-Leg Pistol / Shrimp Squat',
      category: 'compound',
      equipment: 'bodyweight',
      equipProp: 'none',
      kinematics: 'split_squat',
      viewMode: 'side',
      primary: ['quads', 'glutes'],
      secondary: ['hamstrings', 'calves'],
      stabilizers: ['abs', 'obliques'],
      tempo: '3-1-1-0',
      rest: 120,
      bodyweight: true,
      jointStress: ['knees'],
      swapIds: ['bulgarian_split_squat', 'goblet_squat', 'box_jump'],
      breathing: 'Inhale controlling single-leg descent; exhale driving through grounded heel & midfoot.',
      cues: [
        'Extend free leg straight forward and reach arms out for counterbalance.',
        'Control descent slowly without collapsing onto the ankle.',
        'Drive through whole foot to full hip lockout.'
      ],
      mistakes: [
        { bad: 'Plopping into bottom uncontrollably', fix: 'Use a low box target until you own a 3-second eccentric.' }
      ],
      ladder: { easier: 'Box-Assisted Pistol Squat', current: 'Full Pistol Squat', harder: 'Weighted Counterbalance Pistol' }
    },
    {
      id: 'standing_calf_raise',
      name: 'Full-Stretch Standing Calf Raise',
      category: 'isolation',
      equipment: 'dumbbell',
      equipProp: 'box',
      kinematics: 'calf_raise',
      viewMode: 'side',
      primary: ['calves'],
      secondary: [],
      stabilizers: ['quads', 'abs'],
      tempo: '3-2-1-1',
      rest: 60,
      bodyweight: false,
      jointStress: [],
      swapIds: ['box_jump'],
      breathing: 'Inhale sinking heels deep into a 2-second bottom stretch; exhale rising high onto big-toe mound.',
      cues: [
        'Stand on a step or plate with knees straight (targets gastrocnemius maximally).',
        'Pause a full 2 seconds at the bottom stretch to eliminate Achilles tendon bounce.',
        'Drive straight up onto the ball of the big toe and hold 1s at peak.'
      ],
      mistakes: [
        { bad: 'Bouncing rapidly through partial reps', fix: 'Strict 2-second dead pause at bottom stretch doubles hypertrophy stimulus.' }
      ],
      ladder: { easier: 'Bilateral Floor Calf Raise', current: 'Step Calf Raise', harder: 'Single-Leg Weighted Calf Raise' }
    },

    // === ARMS (BICEPS / TRICEPS) ===
    {
      id: 'incline_db_curl',
      name: 'Incline Dumbbell Bicep Curl',
      category: 'isolation',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'curl',
      viewMode: 'side',
      primary: ['biceps'],
      secondary: ['brachioradialis', 'wrist_flexors'],
      stabilizers: ['front_delts'],
      tempo: '3-1-1-1',
      rest: 75,
      bodyweight: false,
      jointStress: [],
      swapIds: ['hammer_curl', 'chinup'],
      breathing: 'Inhale stretching biceps behind torso; exhale curling with supinated wrists.',
      cues: [
        'Recline bench to 45 degrees so upper arms hang straight down behind your torso (long-head stretch).',
        'Keep elbows pinned in place without swinging forward.',
        'Turn pinkies slightly upward at top peak contraction and resist a 3-second descent.'
      ],
      mistakes: [
        { bad: 'Swinging elbows forward into front delts', fix: 'Anchor upper arms pointing straight at the floor throughout the rep.' }
      ],
      ladder: { easier: 'Standing DB Curl', current: 'Incline DB Curl', harder: 'Bayesian Cable Curl' }
    },
    {
      id: 'hammer_curl',
      name: 'Heavy Neutral Hammer Curl',
      category: 'isolation',
      equipment: 'dumbbell',
      equipProp: 'dumbbells',
      kinematics: 'curl',
      viewMode: 'front',
      primary: ['brachioradialis', 'biceps'],
      secondary: ['wrist_flexors'],
      stabilizers: ['abs', 'front_delts'],
      tempo: '2-1-1-0',
      rest: 90,
      bodyweight: false,
      jointStress: [],
      swapIds: ['aw_back_pressure', 'incline_db_curl', 'chinup'],
      breathing: 'Exhale curling thumbs toward shoulders; inhale controlling lowering.',
      cues: [
        'Keep thumbs pointing straight up (neutral grip) to heavily load brachioradialis and brachialis.',
        'Keep wrists stiff and slightly cocked up (rising engagement for arm wrestlers).',
        'Lock elbows by your ribs and avoid lower-back sway.'
      ],
      mistakes: [
        { bad: 'Letting wrists bend backward under load', fix: 'Maintain neutral/slightly risen knuckles to build true arm-thickness and back pressure.' }
      ],
      ladder: { easier: 'Alternating DB Hammer Curl', current: 'Heavy Hammer Curl', harder: 'Fat-Grip / Belt Hammer Drag' }
    },
    {
      id: 'triceps_pushdown',
      name: 'Overhead / Cable Triceps Extension',
      category: 'isolation',
      equipment: 'gym',
      equipProp: 'cable',
      kinematics: 'triceps_ext',
      viewMode: 'side',
      primary: ['triceps'],
      secondary: [],
      stabilizers: ['abs', 'lats'],
      tempo: '3-1-1-1',
      rest: 75,
      bodyweight: false,
      jointStress: ['elbows'],
      swapIds: ['pushup_diamond', 'weighted_dip'],
      breathing: 'Inhale into deep elbow flexion stretch; exhale locking elbows cleanly.',
      cues: [
        'Pin upper arms firmly in position so only the elbow hinge moves.',
        'Use full range of motion—let forearms flex deeply past 90 degrees for long-head growth.',
        'Split rope handles outward slightly at full lockout for a 1-second squeeze.'
      ],
      mistakes: [
        { bad: 'Leaning over the stack using bodyweight', fix: 'Stand tall, lock ribs down, and isolate elbow extension.' }
      ],
      ladder: { easier: 'Band Pushdown', current: 'Cable Triceps Extension', harder: 'Overhead Rope Long-Head Extension' }
    },

    // === ARM WRESTLING SPECIALIST VECTORS (RESEARCH-BACKED) ===
    {
      id: 'aw_belt_pronation',
      name: 'Arm Wrestling Belt Pronation Lift',
      category: 'compound',
      equipment: 'armwrestling',
      equipProp: 'aw_belt',
      kinematics: 'aw_pronation',
      viewMode: 'front',
      primary: ['pronators', 'brachioradialis'],
      secondary: ['biceps', 'wrist_flexors'],
      stabilizers: ['lats', 'abs'],
      tempo: '2-2-X-1',
      rest: 150,
      bodyweight: false,
      jointStress: ['elbows'],
      swapIds: ['aw_rising_lift', 'hammer_curl'],
      breathing: 'Brace core and lat; exhale driving thumb upward and inward against the judo belt loop.',
      cues: [
        'Loop judo/nylon belt over the base of your thumb and wrap behind the back of your hand.',
        'Keep elbow locked at a tight 85-90 degree angle tucked close to your body.',
        'Drive pronation (rotating thumb toward face) while lifting cleanly off the pin or cable—hold peak 2 seconds.'
      ],
      mistakes: [
        { bad: 'Letting wrist dump downward while pronating', fix: 'Keep knuckles high (rising) simultaneously to mirror true Toproll mechanics.' }
      ],
      ladder: { easier: 'Seated Dumbbell Pronation', current: 'Belt Pronation Lift', harder: 'Heavy Isometric Pronation Hold (5s)' }
    },
    {
      id: 'aw_rolling_cup',
      name: 'Rolling Handle Wrist Cupping',
      category: 'compound',
      equipment: 'armwrestling',
      equipProp: 'aw_cable',
      kinematics: 'aw_cupping',
      viewMode: 'side',
      primary: ['wrist_flexors'],
      secondary: ['brachioradialis', 'biceps'],
      stabilizers: ['lats', 'pronators'],
      tempo: '2-1-X-2',
      rest: 135,
      bodyweight: false,
      jointStress: ['elbows'],
      swapIds: ['aw_fat_grip_hold', 'aw_belt_pronation'],
      breathing: 'Inhale allowing controlled finger-tip open; exhale snapping fingers and wrist into a deep cup.',
      cues: [
        'Anchor forearm flat on bench/table pad with wrist clear of the edge.',
        'Clamp fingers securely onto fat/rolling handle (or barbell/dumbbell) and flex wrist fully inward.',
        'Hold full wrist cup for 2 seconds to condition flexor carpi ulnaris & radialis.'
      ],
      mistakes: [
        { bad: 'Bending elbow instead of flexing the wrist', fix: 'Keep forearm glued to the pad so 100% of torque flows through wrist flexors.' }
      ],
      ladder: { easier: 'Dumbbell Wrist Curl', current: 'Rolling Handle Cupping', harder: 'Cable Table-Height High-Load Cup' }
    },
    {
      id: 'aw_rising_lift',
      name: 'Knuckle Rising Lift (Radial Deviation)',
      category: 'isolation',
      equipment: 'armwrestling',
      equipProp: 'aw_belt',
      kinematics: 'aw_rising',
      viewMode: 'side',
      primary: ['brachioradialis', 'wrist_flexors'],
      secondary: ['pronators', 'biceps'],
      stabilizers: ['front_delts'],
      tempo: '2-2-1-1',
      rest: 120,
      bodyweight: false,
      jointStress: [],
      swapIds: ['aw_belt_pronation', 'hammer_curl'],
      breathing: 'Exhale driving index-knuckle skyward; inhale lowering gently without snapping tendon.',
      cues: [
        'Drape belt over your top index-finger knuckle while keeping arm bent at 90 degrees.',
        'Lift solely through radial deviation—keeping your knuckles higher than your wrist at all times.',
        'Hold isometric peak 2 seconds to bulletproof hand height on the arm-wrestling table.'
      ],
      mistakes: [
        { bad: 'Using shoulder shrug to hoist the strap', fix: 'Lock upper arm vertical by your ribs and isolate radial wrist rise.' }
      ],
      ladder: { easier: 'Light Strap Rising', current: 'Standing Knuckle Rising Lift', harder: 'Heavy Static Rising Hold (6s)' }
    },
    {
      id: 'aw_back_pressure',
      name: 'Table-Angle Back-Pressure Drag',
      category: 'compound',
      equipment: 'armwrestling',
      equipProp: 'aw_cable',
      kinematics: 'aw_back_pressure',
      viewMode: 'side',
      primary: ['brachioradialis', 'lats', 'biceps'],
      secondary: ['pronators', 'wrist_flexors', 'rhomboids'],
      stabilizers: ['abs', 'obliques'],
      tempo: '2-2-X-1',
      rest: 165,
      bodyweight: false,
      jointStress: ['elbows'],
      swapIds: ['chinup', 'hammer_curl', 'db_row'],
      breathing: 'Brace core + lat; exhale dragging forearm straight back toward your shoulder while holding angle.',
      cues: [
        'Set cable slightly above table height using a strap or rolling handle.',
        'Keep hand tight to shoulder (tight arm angle) and drag backward using lat + brachioradialis together.',
        'Never let your bicep open past 100 degrees—protect the distal tendon.'
      ],
      mistakes: [
        { bad: 'Opening arm straight under heavy load', fix: 'Maintain tight defensive elbow angle and pull with lat + body weight as one unit.' }
      ],
      ladder: { easier: 'Single-Arm Hammer Cable Row', current: 'Back-Pressure Drag', harder: 'Heavy Isometric 90-Deg Table Drag' }
    },
    {
      id: 'aw_side_pressure',
      name: 'Internal Rotation Side-Pressure Cable',
      category: 'isolation',
      equipment: 'armwrestling',
      equipProp: 'aw_cable',
      kinematics: 'aw_side_pressure',
      viewMode: 'front',
      primary: ['mid_chest', 'front_delts', 'wrist_flexors'],
      secondary: ['lats', 'pronators', 'obliques'],
      stabilizers: ['abs', 'biceps'],
      tempo: '3-2-1-0',
      rest: 135,
      bodyweight: false,
      jointStress: ['shoulders', 'elbows'],
      swapIds: ['cable_fly', 'aw_rolling_cup'],
      breathing: 'Exhale rotating forearm across centerline with shoulder locked; inhale controlling eccentric.',
      cues: [
        'Keep elbow pinned firmly to torso (or table pad) with forearm bent 90 degrees.',
        'Drive sideways across your body using subscapularis, pec, and lat—keeping shoulder behind your hand.',
        'Prioritize controlled 3-second eccentrics to thicken medial elbow ligaments safely.'
      ],
      mistakes: [
        { bad: 'Letting hand lag behind shoulder (arm-break position)', fix: 'Always keep your gaze and shoulder aligned directly behind your hand.' }
      ],
      ladder: { easier: 'Band Internal Rotation (20 reps blood-flow)', current: 'Side-Pressure Cable', harder: 'Table-Pad Isometric Side Hold' }
    },
    {
      id: 'aw_fat_grip_hold',
      name: 'Thick-Bar / Towel Tendon Blood-Flow Hold',
      category: 'isolation',
      equipment: 'armwrestling',
      equipProp: 'pullup_bar',
      kinematics: 'pullup',
      viewMode: 'front',
      primary: ['wrist_flexors', 'brachioradialis'],
      secondary: ['lats', 'pronators'],
      stabilizers: ['abs'],
      tempo: '1-5-1-0',
      rest: 90,
      bodyweight: true,
      jointStress: [],
      swapIds: ['aw_rolling_cup', 'hammer_curl'],
      breathing: 'Steady rhythmic nasal breathing during timed hangs/holds—never hold breath.',
      cues: [
        'Wrap a thick towel over a pull-up bar or attach Fat Gripz to dumbbells.',
        'Clamp crush-grip tightly and perform controlled partial-wrist squeezes or 20-30s active hangs.',
        'Builds tendon vascularity, finger containment, and post-session recovery.'
      ],
      mistakes: [
        { bad: 'Dead-hanging with relaxed shoulders', fix: 'Keep shoulders packed downward to protect labrum while forearms burn.' }
      ],
      ladder: { easier: 'Two-Hand Dead Hang', current: 'Thick-Towel Active Hang', harder: 'One-Arm Assisted Towel Hang' }
    },

    // === ATHLETIC POWER & COMBAT / BOXING ===
    {
      id: 'kb_swing',
      name: 'Explosive Kettlebell / DB Hip Swing',
      category: 'compound',
      equipment: 'dumbbell',
      equipProp: 'kettlebell',
      kinematics: 'kb_swing',
      viewMode: 'side',
      primary: ['glutes', 'hamstrings'],
      secondary: ['lower_back', 'abs', 'front_delts'],
      stabilizers: ['lats', 'brachioradialis'],
      tempo: '1-0-X-0',
      rest: 90,
      bodyweight: false,
      jointStress: ['lower_back'],
      swapIds: ['romanian_deadlift', 'box_jump'],
      breathing: 'Sharp inhale on hip hinge; sharp forceful "tss!" exhale as hips snap to vertical plank.',
      cues: [
        'Hike bell high between thighs with neutral spine—this is a crisp hip hinge, NOT a squat.',
        'Snap glutes and quads violently so arms float weight to chest height effortlessly.',
        'Wait until forearms touch upper thighs before hinging again.'
      ],
      mistakes: [
        { bad: 'Lifting the weight with front delts', fix: 'Treat arms as ropes; 100% of height comes from explosive hip extension.' }
      ],
      ladder: { easier: 'Dumbbell Romanian Deadlift', current: 'Two-Hand Explosive Swing', harder: 'Single-Arm Hardstyle Swing' }
    },
    {
      id: 'box_jump',
      name: 'Explosive Countermovement Jump',
      category: 'compound',
      equipment: 'bodyweight',
      equipProp: 'box',
      kinematics: 'box_jump',
      viewMode: 'side',
      primary: ['quads', 'glutes', 'calves'],
      secondary: ['hamstrings'],
      stabilizers: ['abs'],
      tempo: '1-0-X-1',
      rest: 120,
      bodyweight: true,
      jointStress: ['knees'],
      swapIds: ['kb_swing', 'bodyweight_pistol'],
      breathing: 'Quick inhale on quarter-squat dip; explosive exhale driving arms and hips skyward.',
      cues: [
        'Perform a crisp quarter-squat countermovement throwing arms back, then explode vertically.',
        'Land softly like a ninja on midfoot with knees tracking cleanly over toes.',
        'Step down—never jump backward off an elevated box—and reset fully between reps for max RFD.'
      ],
      mistakes: [
        { bad: 'Doing 20 sloppy cardio jumps while fatigued', fix: 'Keep reps crisp (4-6 reps) with maximum vertical intent.' }
      ],
      ladder: { easier: 'Squat Jump (Low Impact)', current: 'Box / Vertical Countermovement Jump', harder: 'Single-Leg Broad Jump' }
    },
    {
      id: 'rotational_punch',
      name: 'Explosive Rotational Cable / Band Punch',
      category: 'compound',
      equipment: 'combat',
      equipProp: 'cable',
      kinematics: 'rotational_punch',
      viewMode: 'front',
      primary: ['obliques', 'mid_chest', 'front_delts'],
      secondary: ['triceps', 'glutes', 'quads'],
      stabilizers: ['abs', 'calves'],
      tempo: '2-0-X-0',
      rest: 75,
      bodyweight: false,
      jointStress: [],
      swapIds: ['medball_slam', 'pushup_standard'],
      breathing: 'Sharp boxing exhale ("shh!") syncing rear-foot pivot, hip snap, and fist extension.',
      cues: [
        'Stand in staggered orthodox/southpaw fight stance with rear hand loaded by jawline.',
        'Pivot rear heel outward, whip hips through, and fire punch straight down the centerline.',
        'Control the return smoothly to train eccentric rotational deceleration.'
      ],
      mistakes: [
        { bad: 'Pushing only with the arm while feet stay glued', fix: 'Initiate force from rear foot pivot -> hip torque -> shoulder snap.' }
      ],
      ladder: { easier: 'Shadowbox Resistance Band Cross', current: 'Cable Rotational Cross', harder: 'Landmine Explosive Punch Press' }
    },
    {
      id: 'medball_slam',
      name: 'Explosive Overhead Slam / Conditioning',
      category: 'compound',
      equipment: 'combat',
      equipProp: 'medball',
      kinematics: 'medball_slam',
      viewMode: 'side',
      primary: ['abs', 'lats', 'obliques'],
      secondary: ['triceps', 'glutes', 'quads'],
      stabilizers: ['front_delts', 'lower_back'],
      tempo: '1-0-X-0',
      rest: 75,
      bodyweight: false,
      jointStress: [],
      swapIds: ['rotational_punch', 'hanging_leg_raise'],
      breathing: 'Inhale reaching tall overhead; explosive violent exhale driving ball through the floor.',
      cues: [
        'Rise onto toes reaching tall overhead with braced ribs (do not hyperextend low back).',
        'Crunch abs and whip lats down simultaneously, slamming ball directly in front of toes.',
        'Drop hips cleanly to catch/pick up and fire again with max intent.'
      ],
      mistakes: [
        { bad: 'Slamming with straight stiff legs and rounded back', fix: 'Drop into an athletic hinge/squat as you follow through.' }
      ],
      ladder: { easier: 'Bodyweight Explosive Woodchop', current: 'Overhead Med-Ball Slam', harder: 'Rotational Side-to-Side Slam' }
    },
    {
      id: 'guard_shadow_burn',
      name: 'High-Guard Boxing Combo Burnout',
      category: 'isolation',
      equipment: 'combat',
      equipProp: 'dumbbells',
      kinematics: 'boxing_guard',
      viewMode: 'front',
      primary: ['front_delts', 'side_delts', 'obliques'],
      secondary: ['triceps', 'abs', 'traps'],
      stabilizers: ['calves', 'quads'],
      tempo: '1-0-X-0',
      rest: 60,
      bodyweight: true,
      jointStress: [],
      swapIds: ['lateral_raise', 'rotational_punch'],
      breathing: 'Crisp staccato exhale on every punch (1-2-3-2) while keeping chin tucked.',
      cues: [
        'Hold light 1-2 kg dumbbells (or bare fists) pinned tightly to cheekbones in high guard.',
        'Snap rapid straight jabs, crosses, and hooks without dropping elbows or guard hand.',
        'Maintain light bouncy footwork and tight ribcage throughout 30-45s work rounds.'
      ],
      mistakes: [
        { bad: 'Dropping non-punching hand to waist', fix: 'Glue non-punching glove to cheekbone on every single strike.' }
      ],
      ladder: { easier: 'Bare-Hand Guard Drills', current: 'Weighted High-Guard Burnout', harder: '3-Min Championship Tempo Rounds' }
    },

    // === CORE & POSTURE ===
    {
      id: 'hanging_leg_raise',
      name: 'Hanging Strict Leg Raise',
      category: 'isolation',
      equipment: 'calisthenics',
      equipProp: 'pullup_bar',
      kinematics: 'leg_raise',
      viewMode: 'side',
      primary: ['abs'],
      secondary: ['obliques', 'wrist_flexors'],
      stabilizers: ['lats', 'quads'],
      tempo: '2-1-1-1',
      rest: 75,
      bodyweight: true,
      jointStress: [],
      swapIds: ['ab_plank_hollow', 'medball_slam'],
      breathing: 'Exhale curling pelvis upward toward ribcage; inhale lowering with zero pendulum swing.',
      cues: [
        'Engage lats slightly in an active hang to kill body swing.',
        'Curl your tailbone/pelvis upward (spinal flexion)—not just swinging legs from the hip flexors.',
        'Lower slowly over 2 seconds to a dead stop before the next rep.'
      ],
      mistakes: [
        { bad: 'Swinging legs up with momentum', fix: 'Pause 1 second dead-still at the bottom of every rep.' }
      ],
      ladder: { easier: 'Hanging Knee Tuck', current: 'Hanging Leg Raise', harder: 'Strict Toes-to-Bar' }
    },
    {
      id: 'ab_plank_hollow',
      name: 'Hollow-Body / RKC Iron Plank',
      category: 'isolation',
      equipment: 'bodyweight',
      equipProp: 'none',
      kinematics: 'hollow_plank',
      viewMode: 'side',
      primary: ['abs', 'obliques'],
      secondary: ['quads', 'glutes'],
      stabilizers: ['front_delts', 'lats'],
      tempo: '1-5-1-0',
      rest: 60,
      bodyweight: true,
      jointStress: [],
      swapIds: ['hanging_leg_raise', 'medball_slam'],
      breathing: 'Short tense breaths behind a braced abdominal wall ("shield breath").',
      cues: [
        'Press lower back flat (in hollow hold) or tuck tailbone hard (in RKC plank).',
        'Pull elbows mentally toward toes and squeeze glutes + quads at 100% tension.',
        'Log reps as high-tension 5-second isometric pulses or 30-45s holds.'
      ],
      mistakes: [
        { bad: 'Passively hanging out for 3 minutes with arched back', fix: 'Maximal full-body irradiation for 25-40 seconds beats sloppy multi-minute planks.' }
      ],
      ladder: { easier: 'Tucked Hollow Hold', current: 'Full Hollow / RKC Plank', harder: 'Ab-Wheel Rollout / Dragon Flag Neg' }
    }
  ];

  const EXERCISE_MAP = {};
  EXERCISES.forEach(function (ex) { EXERCISE_MAP[ex.id] = ex; });

  const exported = { MUSCLES: MUSCLES, DISCIPLINES: DISCIPLINES, EXERCISES: EXERCISES, EXERCISE_MAP: EXERCISE_MAP };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    root.IronPulseData = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
