Pod::Spec.new do |s|
  s.name           = 'RestCompletionAlert'
  s.version        = '1.0.0'
  s.summary        = 'AlgoSplit rest Live Activity completion bridge'
  s.description    = 'Presents a standard ActivityKit completion alert for the active rest Live Activity.'
  s.author         = 'AlgoSplit'
  s.homepage       = 'https://github.com/palerdr/AlgoSplit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.dependency 'Voltra'
  s.frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
